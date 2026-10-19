import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'

const m = vi.hoisted(() => ({
  prisma: {
    user: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    notification: { createMany: vi.fn().mockResolvedValue({}) },
    settings: { findFirst: vi.fn().mockResolvedValue(null) },
  },
  auth: vi.fn(),
  sendEmail: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: m.prisma, default: m.prisma }))
vi.mock('@/auth', () => ({ auth: m.auth }))
vi.mock('@/lib/email/send', () => ({ sendEmail: m.sendEmail }))

import { consumePasswordToken, hashToken, lookupPasswordToken, passwordProblem } from '@/lib/auth/passwordTokens'
import { POST as resetPost } from '@/app/api/auth/password-reset/route'
import { POST as tokenPost } from '@/app/api/auth/password-token/route'
import { POST as changePassword } from '@/app/api/account/password/route'
import { POST as invitePost } from '@/app/api/staff/route'
import { __resetRateLimitsForTests } from '@/lib/auth/rateLimit'

const json = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } })

const TOKEN = 'a'.repeat(43)
const FUTURE = new Date(Date.now() + 3_600_000)

beforeEach(() => {
  vi.clearAllMocks()
  __resetRateLimitsForTests()
  delete process.env.SENDGRID_API_KEY
  delete process.env.SMTP_USER
  delete process.env.SMTP_PASS
  m.prisma.settings.findFirst.mockResolvedValue(null)
  m.prisma.auditLog.create.mockResolvedValue({})
})

describe('password policy', () => {
  it.each([
    ['short1', /10 characters/],
    ['aaaaaaaaaaaa', /too simple/],
    ['onlyletterslong', /Mix letters/],
    ['Kid0-18CRM', /too common/], // the old shared default
  ])('%s → refused', (pw, msg) => {
    expect(passwordProblem(pw)).toMatch(msg)
  })

  it('accepts a reasonable password', () => {
    expect(passwordProblem('Malveira-2026!')).toBe(null)
  })
})

describe('one-time tokens', () => {
  it('stores and looks up only the hash', async () => {
    m.prisma.user.findFirst.mockResolvedValue({ id: 'u1', email: 'a@b.pt', firstName: 'Ana', passwordTokenExpiresAt: FUTURE, passwordTokenPurpose: 'invite' })
    const r = await lookupPasswordToken(TOKEN)
    expect(r).toEqual({ ok: true, user: { id: 'u1', email: 'a@b.pt', firstName: 'Ana', purpose: 'invite' } })
    expect(m.prisma.user.findFirst.mock.calls[0][0].where).toEqual({ passwordTokenHash: hashToken(TOKEN) })
  })

  it('expired tokens are refused', async () => {
    m.prisma.user.findFirst.mockResolvedValue({ id: 'u1', email: 'a@b.pt', firstName: 'Ana', passwordTokenExpiresAt: new Date(Date.now() - 1000), passwordTokenPurpose: 'reset' })
    expect(await lookupPasswordToken(TOKEN)).toEqual({ ok: false, reason: 'expired' })
  })

  it('a token works once (conditional update loses the race → invalid)', async () => {
    m.prisma.user.findFirst.mockResolvedValue({ id: 'u1', email: 'a@b.pt', firstName: 'Ana', passwordTokenExpiresAt: FUTURE, passwordTokenPurpose: 'reset' })
    m.prisma.user.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    expect(await consumePasswordToken(TOKEN, 'Malveira-2026!')).toMatchObject({ ok: true, userId: 'u1' })
    expect(await consumePasswordToken(TOKEN, 'Malveira-2026!')).toEqual({ ok: false, reason: 'invalid' })
    const data = m.prisma.user.updateMany.mock.calls[0][0].data
    expect(data).toMatchObject({ passwordTokenHash: null, passwordTokenExpiresAt: null })
    expect(await bcrypt.compare('Malveira-2026!', data.passwordHash)).toBe(true)
  })
})

describe('POST /api/auth/password-reset', () => {
  it('answers identically for unknown and known emails', async () => {
    m.prisma.user.findFirst.mockResolvedValueOnce(null)
    const a = await (await resetPost(json('http://x/api/auth/password-reset', { email: 'nobody@x.pt' }))).json()
    m.prisma.user.findFirst.mockResolvedValueOnce({ id: 'u1', email: 'ana@x.pt', firstName: 'Ana', isActive: true, approvalStatus: 'APPROVED', passwordTokenExpiresAt: null, passwordTokenPurpose: null })
    process.env.SMTP_USER = 'u'
    process.env.SMTP_PASS = 'p'
    m.prisma.user.update.mockResolvedValue({})
    m.sendEmail.mockResolvedValue({ provider: 'smtp' })
    const b = await (await resetPost(json('http://x/api/auth/password-reset', { email: 'ana@x.pt' }))).json()
    expect(a).toEqual(b)
    expect(m.sendEmail).toHaveBeenCalledTimes(1)
    const [to, , , text] = m.sendEmail.mock.calls[0]
    expect(to).toBe('ana@x.pt')
    expect(text).toMatch(/\/login\?token=/)
  })

  it('does not email deactivated or pending accounts', async () => {
    process.env.SMTP_USER = 'u'
    process.env.SMTP_PASS = 'p'
    m.prisma.user.findFirst.mockResolvedValue({ id: 'u1', email: 'ana@x.pt', firstName: 'Ana', isActive: false, approvalStatus: 'APPROVED' })
    await resetPost(json('http://x/api/auth/password-reset', { email: 'ana@x.pt' }))
    expect(m.sendEmail).not.toHaveBeenCalled()
  })

  it('rate-limits a client', async () => {
    m.prisma.user.findFirst.mockResolvedValue(null)
    const statuses: number[] = []
    for (let i = 0; i < 7; i++) statuses.push((await resetPost(json('http://x/api/auth/password-reset', { email: 'a@b.pt' }, { 'x-forwarded-for': '1.2.3.4' }))).status)
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true)
    expect(statuses[6]).toBe(429)
  })
})

describe('POST /api/auth/password-token', () => {
  it('weak password → 400 with the reason', async () => {
    const res = await tokenPost(json('http://x/api/auth/password-token', { token: TOKEN, password: 'short' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/10 characters/)
  })

  it('pending account: password saved but cannot sign in yet', async () => {
    m.prisma.user.findFirst.mockResolvedValue({ id: 'u1', email: 'a@b.pt', firstName: 'Ana', passwordTokenExpiresAt: FUTURE, passwordTokenPurpose: 'invite' })
    m.prisma.user.updateMany.mockResolvedValue({ count: 1 })
    m.prisma.user.findUnique.mockResolvedValue({ approvalStatus: 'PENDING', isActive: false })
    const body = await (await tokenPost(json('http://x/api/auth/password-token', { token: TOKEN, password: 'Malveira-2026!' }))).json()
    expect(body).toMatchObject({ ok: true, canSignIn: false })
  })
})

describe('POST /api/account/password', () => {
  beforeEach(() => m.auth.mockResolvedValue({ user: { id: 'u1', role: 'STAFF' } }))

  it('wrong current password is 400, not 401', async () => {
    m.prisma.user.findUnique.mockResolvedValue({ passwordHash: await bcrypt.hash('Old-password-1', 4) })
    const res = await changePassword(json('http://x/api/account/password', { currentPassword: 'nope', newPassword: 'Malveira-2026!' }))
    expect(res.status).toBe(400)
  })

  it('changes the password and burns any outstanding reset link', async () => {
    m.prisma.user.findUnique.mockResolvedValue({ passwordHash: await bcrypt.hash('Old-password-1', 4) })
    m.prisma.user.update.mockResolvedValue({})
    const res = await changePassword(json('http://x/api/account/password', { currentPassword: 'Old-password-1', newPassword: 'Malveira-2026!' }))
    expect(res.status).toBe(200)
    expect(m.prisma.user.update.mock.calls[0][0].data).toMatchObject({ passwordTokenHash: null })
  })

  it('requires a session', async () => {
    m.auth.mockResolvedValue(null)
    const res = await changePassword(json('http://x/api/account/password', { currentPassword: 'a', newPassword: 'b' }))
    expect(res.status).toBe(401)
  })
})

describe('POST /api/staff (invite)', () => {
  beforeEach(() => m.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN', email: 'admin@x.pt' } }))

  it('creates the account with an unknowable password and returns a one-time link when email is off', async () => {
    m.prisma.user.findFirst.mockResolvedValue(null)
    m.prisma.user.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new-1', ...data }))
    m.prisma.user.findMany.mockResolvedValue([{ id: 'admin-1' }])
    m.prisma.user.update.mockResolvedValue({})
    const res = await invitePost(json('http://x/api/staff', { firstName: 'Rita', lastName: 'Lopes', email: 'Rita@Clinic.pt', role: 'staff' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.emailSent).toBe(false)
    expect(body.inviteUrl).toMatch(/\/login\?token=/)
    expect(body.user.passwordHash).toBeUndefined()
    const created = m.prisma.user.create.mock.calls[0][0].data
    expect(created.email).toBe('rita@clinic.pt')
    expect(await bcrypt.compare('Kid0-18CRM', created.passwordHash)).toBe(false)
  })

  it('rejects an unknown role', async () => {
    m.prisma.user.findFirst.mockResolvedValue(null)
    const res = await invitePost(json('http://x/api/staff', { firstName: 'R', lastName: 'L', email: 'r@c.pt', role: 'superuser' }))
    expect(res.status).toBe(400)
  })
})
