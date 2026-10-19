import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'

const m = vi.hoisted(() => {
  const store: { user: Record<string, unknown> } = { user: {} }
  return {
    store,
    auth: vi.fn(),
    prisma: {
      user: {
        findUnique: vi.fn(async () => ({ ...store.user })),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(store.user, data)),
        updateMany: vi.fn(async ({ where, data }: { where: { OR: { twoFactorLastStep: unknown }[] }; data: Record<string, unknown> }) => {
          const last = store.user.twoFactorLastStep as number | null
          const lt = (where.OR[1].twoFactorLastStep as { lt: number }).lt
          if (last === null || last < lt) {
            Object.assign(store.user, data)
            return { count: 1 }
          }
          return { count: 0 }
        }),
      },
      settings: { findFirst: vi.fn(async () => ({ practiceName: 'Clínica', sessionTimeout: 30, twoFactorRequired: false })) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    },
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: m.prisma, default: m.prisma }))
vi.mock('@/auth', () => ({ auth: m.auth }))
vi.mock('@/lib/crypto', () => ({ encrypt: (v: string) => `enc:${v}`, decrypt: (v: string) => v.replace(/^enc:/, '') }))

import { POST, GET } from '@/app/api/account/2fa/route'
import { totp } from '@/lib/auth/totp'
import { clearSessionPolicyCache, isIdleExpired, mustEnrollTwoFactor, normaliseIdleMinutes } from '@/lib/auth/sessionPolicy'
import { __resetRateLimitsForTests } from '@/lib/auth/rateLimit'

const post = (body: unknown) => POST(new NextRequest('http://x/api/account/2fa', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }))

beforeEach(async () => {
  vi.clearAllMocks()
  __resetRateLimitsForTests()
  clearSessionPolicyCache()
  m.auth.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } })
  m.store.user = { id: 'u1', email: 'ana@clinic.pt', role: 'ADMIN', twoFactorEnabled: false, twoFactorSecret: null, twoFactorLastStep: null, passwordHash: await bcrypt.hash('Malveira-2026!', 4) }
  m.prisma.settings.findFirst.mockResolvedValue({ practiceName: 'Clínica', sessionTimeout: 30, twoFactorRequired: false })
})

describe('two-factor enrolment', () => {
  it('setup → wrong code refused → right code enables; secret stored encrypted', async () => {
    const setup = await (await post({ action: 'setup' })).json()
    expect(setup.secret).toMatch(/^[A-Z2-7]{32}$/)
    expect(setup.otpauthUri).toContain(`secret=${setup.secret}`)
    expect(m.store.user.twoFactorSecret).toBe(`enc:${setup.secret}`)
    expect((await post({ action: 'enable', code: '000000' })).status).toBe(400)
    const ok = await post({ action: 'enable', code: totp(setup.secret) })
    expect(ok.status).toBe(200)
    expect(m.store.user.twoFactorEnabled).toBe(true)
    expect(m.prisma.auditLog.create).toHaveBeenCalled()
  })

  it('a code cannot be used twice', async () => {
    const { secret } = await (await post({ action: 'setup' })).json()
    const code = totp(secret)
    expect((await post({ action: 'enable', code })).status).toBe(200)
    // disabling with the same (already used) code must fail
    expect((await post({ action: 'disable', password: 'Malveira-2026!', code })).status).toBe(400)
    expect(m.store.user.twoFactorEnabled).toBe(true)
  })

  it('disable requires the password and a fresh code', async () => {
    const { secret } = await (await post({ action: 'setup' })).json()
    await post({ action: 'enable', code: totp(secret) })
    m.store.user.twoFactorLastStep = 0 // pretend the enable code was long ago
    expect((await post({ action: 'disable', password: 'wrong', code: totp(secret) })).status).toBe(400)
    expect((await post({ action: 'disable', password: 'Malveira-2026!', code: totp(secret) })).status).toBe(200)
    expect(m.store.user).toMatchObject({ twoFactorEnabled: false, twoFactorSecret: null })
  })

  it('an admin cannot turn it off while clinic policy requires it', async () => {
    const { secret } = await (await post({ action: 'setup' })).json()
    await post({ action: 'enable', code: totp(secret) })
    clearSessionPolicyCache()
    m.prisma.settings.findFirst.mockResolvedValue({ practiceName: 'Clínica', sessionTimeout: 30, twoFactorRequired: true })
    expect((await post({ action: 'disable', password: 'Malveira-2026!', code: totp(secret) })).status).toBe(403)
    const status = await (await GET()).json()
    expect(status).toMatchObject({ enabled: true, requiredByPolicy: true })
  })

  it('re-running setup while enabled is refused (no silent phone swap)', async () => {
    const { secret } = await (await post({ action: 'setup' })).json()
    await post({ action: 'enable', code: totp(secret) })
    expect((await post({ action: 'setup' })).status).toBe(409)
  })
})

describe('session policy', () => {
  it('idle expiry', () => {
    const now = 1_000_000_000
    expect(isIdleExpired(now - 29 * 60_000, 30, now)).toBe(false)
    expect(isIdleExpired(now - 31 * 60_000, 30, now)).toBe(true)
    expect(isIdleExpired(undefined, 30, now)).toBe(false)
  })

  it('timeout values are clamped to a safe range', () => {
    expect(normaliseIdleMinutes(null)).toBe(30)
    expect(normaliseIdleMinutes(0)).toBe(30)
    expect(normaliseIdleMinutes(1)).toBe(5)
    expect(normaliseIdleMinutes(10_000)).toBe(240)
  })

  it('only admins without two-factor must enrol, only when required', () => {
    const on = { idleMinutes: 30, requireAdmin2fa: true }
    const off = { idleMinutes: 30, requireAdmin2fa: false }
    expect(mustEnrollTwoFactor('ADMIN', false, on)).toBe(true)
    expect(mustEnrollTwoFactor('ADMIN', true, on)).toBe(false)
    expect(mustEnrollTwoFactor('STAFF', false, on)).toBe(false)
    expect(mustEnrollTwoFactor('ADMIN', false, off)).toBe(false)
  })
})
