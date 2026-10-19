import { describe, it, expect } from 'vitest'
import {
  addDays,
  dayBoundsUtc,
  formatDateStringLong,
  formatTime,
  isValidDateString,
  parseTimeInput,
  timeZoneOffsetMinutes,
  todayInZone,
  utcToZoned,
  weekdayOf,
  zonedTimeToUtc,
} from '@/lib/clinic/time'

const TZ = 'Europe/Lisbon'

describe('lib/clinic/time — Lisbon wall time ↔ UTC', () => {
  it('winter: Lisbon equals UTC', () => {
    expect(zonedTimeToUtc('2026-01-15', '09:30', TZ).toISOString()).toBe('2026-01-15T09:30:00.000Z')
  })

  it('summer: Lisbon is UTC+1 (the bug a UTC server would make)', () => {
    expect(zonedTimeToUtc('2026-07-15', '09:30', TZ).toISOString()).toBe('2026-07-15T08:30:00.000Z')
  })

  it('handles the spring-forward day (29 Mar 2026)', () => {
    expect(zonedTimeToUtc('2026-03-29', '09:30', TZ).toISOString()).toBe('2026-03-29T08:30:00.000Z')
    // 01:30 does not exist that night — it moves forward instead of going back in time
    expect(zonedTimeToUtc('2026-03-29', '01:30', TZ).toISOString()).toBe('2026-03-29T01:30:00.000Z')
  })

  it('handles the fall-back day (25 Oct 2026)', () => {
    expect(zonedTimeToUtc('2026-10-25', '09:30', TZ).toISOString()).toBe('2026-10-25T09:30:00.000Z')
    expect(zonedTimeToUtc('2026-10-24', '09:30', TZ).toISOString()).toBe('2026-10-24T08:30:00.000Z')
  })

  it('round-trips UTC → Lisbon wall time', () => {
    const z = utcToZoned(new Date('2026-07-15T08:30:00Z'), TZ)
    expect(z).toEqual({ date: '2026-07-15', time: '09:30', minutes: 570, weekday: 3 })
  })

  it('day bounds cover exactly the Lisbon calendar day', () => {
    const { start, end } = dayBoundsUtc('2026-07-15', TZ)
    expect(start.toISOString()).toBe('2026-07-14T23:00:00.000Z')
    expect(end.toISOString()).toBe('2026-07-15T23:00:00.000Z')
    // A 23h day on the spring-forward date
    const spring = dayBoundsUtc('2026-03-29', TZ)
    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(23)
  })

  it('today is computed in the clinic zone, not the server zone', () => {
    // 23:30 UTC on 14 July is already 15 July in Lisbon
    expect(todayInZone(TZ, new Date('2026-07-14T23:30:00Z'))).toBe('2026-07-15')
  })

  it('offset helper reports 0 / 60 minutes', () => {
    expect(timeZoneOffsetMinutes(new Date('2026-01-01T12:00:00Z'), TZ)).toBe(0)
    expect(timeZoneOffsetMinutes(new Date('2026-08-01T12:00:00Z'), TZ)).toBe(60)
  })
})

describe('lib/clinic/time — calendar helpers', () => {
  it('validates real dates only', () => {
    expect(isValidDateString('2026-02-28')).toBe(true)
    expect(isValidDateString('2026-02-30')).toBe(false)
    expect(isValidDateString('2026-2-3')).toBe(false)
    expect(isValidDateString('tomorrow')).toBe(false)
  })

  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('weekday of a date string', () => {
    expect(weekdayOf('2026-10-17')).toBe(6) // Saturday
    expect(weekdayOf('2026-10-19')).toBe(1) // Monday
  })

  it('formats in pt-PT', () => {
    expect(formatDateStringLong('2026-10-20')).toBe('terça-feira, 20 de outubro')
    expect(formatTime(new Date('2026-07-15T08:30:00Z'), TZ)).toBe('09:30')
  })
})

describe('lib/clinic/time — parseTimeInput', () => {
  it.each([
    ['9:15', '09:15'],
    ['09:15', '09:15'],
    ['9h15', '09:15'],
    ['14h', '14:00'],
    ['14.30', '14:30'],
    ['2:30pm', '14:30'],
    ['2 pm', '14:00'],
    ['12am', '00:00'],
    ['12:00pm', '12:00'],
  ])('%s → %s', (input, expected) => {
    expect(parseTimeInput(input)).toBe(expected)
  })

  it.each(['25:00', '9:75', '13pm', 'soon', ''])('rejects %s', (input) => {
    expect(parseTimeInput(input)).toBe(null)
  })
})
