import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }))

import { checkSlot, computeDaySlots } from '@/lib/appointments/availability'
import { buildClinicSettings } from '@/lib/clinic/settings'

const rules = buildClinicSettings(null)
// Saturday 17 Oct 2026, 10:00 Lisbon (UTC+1)
const NOW = new Date('2026-10-17T09:00:00Z')
const MONDAY = '2026-10-19'

describe('computeDaySlots — clinic hours', () => {
  it('Monday: 09:30–12:30 and 14:00–18:00 in 30-minute slots', () => {
    const { slots, closedReason } = computeDaySlots({ date: MONDAY, durationMinutes: 30, rules, booked: [], now: NOW, enforceNotice: true })
    expect(closedReason).toBe(null)
    const starts = slots.map((s) => s.startTime)
    expect(starts[0]).toBe('09:30')
    expect(starts).toContain('12:00')
    expect(starts).not.toContain('12:30') // lunch
    expect(starts).not.toContain('13:30')
    expect(starts).toContain('14:00')
    expect(starts[starts.length - 1]).toBe('17:30')
    expect(slots).toHaveLength(14)
  })

  it('a 45-minute visit never runs into lunch or past closing', () => {
    const { slots } = computeDaySlots({ date: MONDAY, durationMinutes: 45, rules, booked: [], now: NOW, enforceNotice: true })
    const starts = slots.map((s) => s.startTime)
    expect(starts).not.toContain('12:00') // would end 12:45
    expect(starts).toContain('11:30')
    expect(starts).not.toContain('17:30') // would end 18:15
    expect(starts).toContain('17:00')
  })

  it('Saturday is closed', () => {
    expect(computeDaySlots({ date: '2026-10-17', durationMinutes: 30, rules, booked: [], now: NOW, enforceNotice: true }).closedReason).toBe('closed')
  })

  it('national holiday is closed with its name', () => {
    expect(computeDaySlots({ date: '2026-12-08', durationMinutes: 30, rules, booked: [], now: NOW, enforceNotice: true }).closedReason).toBe('Imaculada Conceição')
  })

  it('past days and days beyond the booking horizon return no slots', () => {
    expect(computeDaySlots({ date: '2026-10-16', durationMinutes: 30, rules, booked: [], now: NOW, enforceNotice: true }).closedReason).toBe('past')
    expect(computeDaySlots({ date: '2027-06-01', durationMinutes: 30, rules, booked: [], now: NOW, enforceNotice: true }).closedReason).toBe('too_far')
  })

  it('excludes booked appointments (stored in UTC) at the correct Lisbon time', () => {
    // 10:00–10:30 Lisbon on 19 Oct 2026 is 09:00–09:30 UTC (summer time)
    const booked = [{ startTime: new Date('2026-10-19T09:00:00Z'), endTime: new Date('2026-10-19T09:30:00Z') }]
    const starts = computeDaySlots({ date: MONDAY, durationMinutes: 30, rules, booked, now: NOW, enforceNotice: true }).slots.map((s) => s.startTime)
    expect(starts).not.toContain('10:00')
    expect(starts).toContain('09:30')
    expect(starts).toContain('10:30')
  })

  it('today: respects minimum notice for the agent but not for staff', () => {
    // Monday 19 Oct, now 09:45 Lisbon (08:45 UTC)
    const now = new Date('2026-10-19T08:45:00Z')
    const agent = computeDaySlots({ date: MONDAY, durationMinutes: 30, rules, booked: [], now, enforceNotice: true }).slots.map((s) => s.startTime)
    const staff = computeDaySlots({ date: MONDAY, durationMinutes: 30, rules, booked: [], now, enforceNotice: false }).slots.map((s) => s.startTime)
    expect(agent[0]).toBe('11:00') // 60 min notice
    expect(staff[0]).toBe('10:00')
  })
})

describe('checkSlot — the booking guard', () => {
  const base = { durationMinutes: 30, rules, booked: [], now: NOW, enforceNotice: true }

  it('accepts a free slot and returns the UTC instant', () => {
    const r = checkSlot({ ...base, date: MONDAY, time: '10:15' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.startUtc.toISOString()).toBe('2026-10-19T09:15:00.000Z')
  })

  it.each([
    ['2026-10-19', '09:00', 'outside_hours'],
    ['2026-10-19', '17:45', 'outside_hours'],
    ['2026-10-19', '12:15', 'lunch'],
    ['2026-10-17', '10:00', 'closed'],
    ['2026-12-25', '10:00', 'holiday'],
    ['2026-10-16', '10:00', 'past'],
    ['2026-02-30', '10:00', 'invalid_date'],
    ['2026-10-19', '9:00', 'invalid_time'],
  ])('%s %s → %s', (date, time, reason) => {
    const r = checkSlot({ ...base, date, time })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe(reason)
  })

  it('refuses an overlapping booking and honours the buffer', () => {
    const booked = [{ startTime: new Date('2026-10-19T09:00:00Z'), endTime: new Date('2026-10-19T09:30:00Z') }] // 10:00–10:30 Lisbon
    expect(checkSlot({ ...base, booked, date: MONDAY, time: '10:15' })).toMatchObject({ ok: false, reason: 'conflict' })
    expect(checkSlot({ ...base, booked, date: MONDAY, time: '10:30' }).ok).toBe(true)
    // A 30-min slot at 09:30 with a 10-min buffer would collide with the 10:00 booking
    expect(checkSlot({ ...base, booked, date: MONDAY, time: '09:30', bufferMinutes: 10 })).toMatchObject({ ok: false, reason: 'conflict' })
  })
})
