import { describe, expect, it } from 'vitest'
import { entryFitsSlot, type MatchableEntry, type SlotQuery } from '@/lib/appointments/waitlistMatch'

const base: MatchableEntry = { status: 'ACTIVE', type: null, providerId: null, fromDate: '2026-11-02', untilDate: null, timeOfDay: 'ANY', currentStart: null }
const slot: SlotQuery = { date: '2026-11-04', time: '10:00', durationMinutes: 30, providerId: 'ana-nunes' }
const durations: Record<string, number> = { EVALUATION: 30, HYGIENE: 45 }
const fits = (e: Partial<MatchableEntry>, s: Partial<SlotQuery> = {}) => entryFitsSlot({ ...base, ...e }, { ...slot, ...s }, (t) => durations[t] ?? null)

describe('waiting list: which entries suit a free slot', () => {
  it('an open entry fits any slot in its dates', () => {
    expect(fits({})).toBe(true)
  })

  it('only active entries', () => {
    expect(fits({ status: 'BOOKED' })).toBe(false)
    expect(fits({ status: 'REMOVED' })).toBe(false)
  })

  it('respects the from / until dates', () => {
    expect(fits({ fromDate: '2026-11-05' })).toBe(false)
    expect(fits({ untilDate: '2026-11-03' })).toBe(false)
    expect(fits({ untilDate: '2026-11-04' })).toBe(true)
  })

  it('a chosen dentist must match; "any dentist" fits everyone', () => {
    expect(fits({ providerId: 'rui-monteiro' })).toBe(false)
    expect(fits({ providerId: 'ana-nunes' })).toBe(true)
    expect(fits({ providerId: 'rui-monteiro' }, { providerId: null })).toBe(true)
  })

  it('mornings end at 13:00', () => {
    expect(fits({ timeOfDay: 'MORNING' }, { time: '12:30' })).toBe(true)
    expect(fits({ timeOfDay: 'MORNING' }, { time: '13:00' })).toBe(false)
    expect(fits({ timeOfDay: 'AFTERNOON' }, { time: '13:00' })).toBe(true)
    expect(fits({ timeOfDay: 'AFTERNOON' }, { time: '09:00' })).toBe(false)
  })

  it('the freed time must be long enough for what they need', () => {
    expect(fits({ type: 'HYGIENE' })).toBe(false)
    expect(fits({ type: 'HYGIENE' }, { durationMinutes: 45 })).toBe(true)
    expect(fits({ type: 'EVALUATION' })).toBe(true)
  })

  it('someone with a booking only fits a time earlier than it', () => {
    expect(fits({ currentStart: '2026-11-20T09:00' })).toBe(true)
    expect(fits({ currentStart: '2026-11-04T10:00' })).toBe(false)
    expect(fits({ currentStart: '2026-11-03T09:00' })).toBe(false)
  })
})
