import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }))

import { checkSlot, computeDaySlots, providerWindowsOn, slotIssues } from '@/lib/appointments/availability'
import { buildClinicSettings } from '@/lib/clinic/settings'

const rules = buildClinicSettings(null)
// Saturday 17 Oct 2026, 10:00 Lisbon
const NOW = new Date('2026-10-17T09:00:00Z')
const MONDAY = '2026-10-19'
const base = { date: MONDAY, durationMinutes: 30, rules, booked: [], now: NOW, enforceNotice: true }

describe('dentist working hours', () => {
  const mornings = { workingHours: [{ weekday: 1, start: '09:30', end: '12:30' }] }

  it('null hours = follows the clinic', () => {
    expect(providerWindowsOn(MONDAY, { workingHours: null })).toBe(null)
  })

  it('picks the windows of that weekday only', () => {
    expect(providerWindowsOn(MONDAY, mornings)).toEqual([{ start: '09:30', end: '12:30' }])
    expect(providerWindowsOn('2026-10-20', mornings)).toEqual([]) // Tuesday: not working
  })

  it('a dentist who works mornings only has no afternoon slots', () => {
    const starts = computeDaySlots({ ...base, providerWindows: providerWindowsOn(MONDAY, mornings) }).slots.map((s) => s.startTime)
    expect(starts[0]).toBe('09:30')
    expect(starts.at(-1)).toBe('12:00')
    expect(starts).not.toContain('14:00')
  })

  it('a day the dentist does not work has no slots and says why', () => {
    expect(computeDaySlots({ ...base, date: '2026-10-20', providerWindows: [] }).closedReason).toBe('provider_off')
  })

  it('refuses a time outside their hours with provider_off', () => {
    const r = checkSlot({ ...base, time: '15:00', providerWindows: [{ start: '09:30', end: '12:30' }] })
    expect(r).toEqual({ ok: false, reason: 'provider_off' })
  })

  it('split shifts: a visit may not straddle the gap', () => {
    const windows = [{ start: '09:30', end: '11:00' }, { start: '11:30', end: '12:30' }]
    expect(checkSlot({ ...base, time: '10:30', providerWindows: windows }).ok).toBe(true)
    expect(checkSlot({ ...base, time: '10:45', providerWindows: windows }).ok).toBe(false)
  })
})

describe('blocked time', () => {
  // 15:00–16:00 Lisbon = 14:00–15:00 UTC
  const blocks = [{ startTime: new Date('2026-10-19T14:00:00Z'), endTime: new Date('2026-10-19T15:00:00Z') }]

  it('removes blocked slots', () => {
    const starts = computeDaySlots({ ...base, blocks }).slots.map((s) => s.startTime)
    expect(starts).toContain('14:30')
    expect(starts).not.toContain('15:00')
    expect(starts).not.toContain('15:30')
    expect(starts).toContain('16:00')
  })

  it('a buffer does not apply to blocks', () => {
    // 14:30–15:00 visit with a 10-minute buffer ends exactly when the block starts.
    expect(checkSlot({ ...base, time: '14:30', bufferMinutes: 10, blocks }).ok).toBe(true)
  })
})

describe('slotIssues lists every reason (staff see them all)', () => {
  it('outside hours and a conflict at once', () => {
    const booked = [{ startTime: new Date('2026-10-19T17:00:00Z'), endTime: new Date('2026-10-19T17:30:00Z') }]
    const r = slotIssues({ ...base, time: '18:00', booked })
    expect(r.issues.map((i) => i.reason)).toEqual(['outside_hours', 'conflict'])
  })

  it('checkSlot still returns the first reason', () => {
    expect(checkSlot({ ...base, time: '12:15' })).toEqual({ ok: false, reason: 'lunch' })
  })

  it('holiday detail is carried', () => {
    const r = slotIssues({ ...base, date: '2026-12-08', time: '10:00' })
    expect(r.issues[0]).toEqual({ reason: 'holiday', detail: 'Imaculada Conceição' })
  })

  it('DST: the last Sunday of October still maps Lisbon 10:00 correctly (winter = UTC)', () => {
    // 26 Oct 2026 is the Monday after the switch → 10:00 Lisbon = 10:00 UTC
    const r = checkSlot({ ...base, date: '2026-10-26', time: '10:00' })
    expect(r.ok && r.startUtc.toISOString()).toBe('2026-10-26T10:00:00.000Z')
  })
})
