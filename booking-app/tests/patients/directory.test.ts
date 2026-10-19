import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }))

import { directoryWhere } from '@/lib/patients/directory'

const now = new Date('2026-10-19T12:00:00Z')
const opts = { now, recallMonths: 6 }
const and = (q: Parameters<typeof directoryWhere>[0]) => (directoryWhere(q, opts).AND as Record<string, unknown>[])

describe('directoryWhere', () => {
  it('always hides drafts and archived records', () => {
    expect(and({})).toEqual([{ status: { notIn: ['DRAFT', 'ARCHIVED'] } }])
  })

  it('every search word must match a name, phone, NIF, email or tag', () => {
    const w = and({ q: 'maria 912' })
    expect(w).toHaveLength(3)
    const second = (w[2] as { OR: Record<string, unknown>[] }).OR
    expect(second).toEqual(expect.arrayContaining([{ phone: { contains: '912' } }, { phone2: { contains: '912' } }, { nif: { contains: '912' } }, { externalId: 'zappy:912' }]))
  })

  it('recall due: last visit older than the recall interval and nothing booked', () => {
    const w = and({ recallDue: true })
    expect(w[1]).toEqual({ appointments: { none: { startTime: { gt: now }, status: { in: ['SCHEDULED', 'CONFIRMED'] } } } })
    expect((w[2] as { lastVisitAt: { lt: Date } }).lastVisitAt.lt.toISOString()).toBe('2026-04-19T12:00:00.000Z')
  })

  it('lost: no visit for 18 months and nothing booked; never came: no visit at all', () => {
    const lost = and({ lifecycle: 'lost' })
    expect((lost[3] as { lastVisitAt: { lt: Date } }).lastVisitAt.lt.toISOString()).toBe('2025-04-19T12:00:00.000Z')
    expect(and({ lifecycle: 'potential' })[3]).toEqual({ lastVisitAt: null })
  })

  it('missing data filters', () => {
    expect(and({ missing: 'phone' })[1]).toEqual({ phone: null, phone2: null })
    expect(and({ missing: 'dob' })[1]).toEqual({ dateOfBirth: null })
  })

  it('tag filter uses the array index', () => {
    expect(and({ tag: 'DIARIO CLINICO' })[1]).toEqual({ tags: { has: 'DIARIO CLINICO' } })
  })
})
