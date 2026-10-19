import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }))

import { appointmentLinkToken, dedupeKey, hashLinkToken, intoSendingWindow, planMessages } from '@/lib/appointments/notifications'
import { DEFAULT_REMINDER_POLICY, type ReminderPolicy } from '@/lib/clinic/settings'

const TZ = 'Europe/Lisbon'
const policy: ReminderPolicy = DEFAULT_REMINDER_POLICY
// Thursday 22 Oct 2026 10:30 Lisbon = 09:30 UTC
const START = new Date('2026-10-22T09:30:00Z')
const both = ['SMS', 'EMAIL'] as const

const kinds = (plan: ReturnType<typeof planMessages>) => plan.map((m) => `${m.kind}/${m.channel}@${m.sendAt.toISOString()}`)

describe('planMessages — new booking', () => {
  it('booked days ahead: confirmation now + day-before reminder at 10:00 Lisbon', () => {
    const now = new Date('2026-10-19T10:00:00Z') // Monday 11:00 Lisbon
    const plan = planMessages({ startTime: START, event: { type: 'created', notifyPatient: true }, policy, timeZone: TZ, now, channels: [...both] })
    expect(kinds(plan)).toEqual([
      'CONFIRMATION/SMS@2026-10-19T10:00:00.000Z',
      'CONFIRMATION/EMAIL@2026-10-19T10:00:00.000Z',
      'REMINDER_DAY_BEFORE/SMS@2026-10-21T09:00:00.000Z', // Wed 10:00 Lisbon
      'REMINDER_DAY_BEFORE/EMAIL@2026-10-21T09:00:00.000Z',
    ])
  })

  it('booked this morning for tomorrow: no second SMS a few hours later', () => {
    const now = new Date('2026-10-21T07:30:00Z') // Wed 08:30 Lisbon — before quiet start
    const plan = planMessages({ startTime: START, event: { type: 'created', notifyPatient: true }, policy, timeZone: TZ, now, channels: ['SMS'] })
    // Confirmation waits for 09:00; the 10:00 reminder is covered by it.
    expect(kinds(plan)).toEqual(['CONFIRMATION/SMS@2026-10-21T08:00:00.000Z'])
  })

  it('booked tomorrow afternoon: the day-before time has passed — confirmation only', () => {
    const now = new Date('2026-10-21T15:00:00Z')
    const plan = planMessages({ startTime: START, event: { type: 'created', notifyPatient: true }, policy, timeZone: TZ, now, channels: ['SMS'] })
    expect(plan.map((m) => m.kind)).toEqual(['CONFIRMATION'])
  })

  it('AI booking at 23:00 for 09:15 next day: the confirmation would come too late — nothing sent', () => {
    const start = new Date('2026-10-22T08:15:00Z') // 09:15 Lisbon
    const now = new Date('2026-10-21T22:00:00Z') // 23:00 Lisbon
    const plan = planMessages({ startTime: start, event: { type: 'created', notifyPatient: true }, policy, timeZone: TZ, now, channels: ['SMS'] })
    expect(plan).toEqual([])
  })

  it('staff unticked "notify patient": reminders still planned, no confirmation', () => {
    const now = new Date('2026-10-19T10:00:00Z')
    const plan = planMessages({ startTime: START, event: { type: 'created', notifyPatient: false }, policy, timeZone: TZ, now, channels: ['SMS'] })
    expect(plan.map((m) => m.kind)).toEqual(['REMINDER_DAY_BEFORE'])
  })

  it('only channels the patient can receive', () => {
    const now = new Date('2026-10-19T10:00:00Z')
    const plan = planMessages({ startTime: START, event: { type: 'created', notifyPatient: true }, policy, timeZone: TZ, now, channels: ['EMAIL'] })
    expect(new Set(plan.map((m) => m.channel))).toEqual(new Set(['EMAIL']))
  })

  it('hours-before reminder when enabled and booked well ahead', () => {
    const now = new Date('2026-10-19T10:00:00Z')
    const p = { ...policy, hoursBefore: { enabled: true, hours: 3, channels: ['SMS' as const] } }
    const plan = planMessages({ startTime: START, event: { type: 'created', notifyPatient: true }, policy: p, timeZone: TZ, now, channels: ['SMS'] })
    // 10:30 − 3 h = 07:30 Lisbon → moved to 09:00 (quiet hours) → still ≥ 30 min before
    expect(kinds(plan)).toContain('REMINDER_HOURS_BEFORE/SMS@2026-10-22T08:00:00.000Z')
  })
})

describe('planMessages — changes', () => {
  const now = new Date('2026-10-19T10:00:00Z')

  it('rescheduled: change notice + new reminders, no confirmation', () => {
    const plan = planMessages({ startTime: START, event: { type: 'rescheduled', notifyPatient: true }, policy, timeZone: TZ, now, channels: ['SMS'] })
    expect(plan.map((m) => m.kind)).toEqual(['RESCHEDULED', 'REMINDER_DAY_BEFORE'])
  })

  it('cancelled: one notice, nothing else', () => {
    const plan = planMessages({ startTime: START, event: { type: 'cancelled', notifyPatient: true }, policy, timeZone: TZ, now, channels: ['SMS'] })
    expect(plan.map((m) => m.kind)).toEqual(['CANCELLED'])
  })

  it('cancelled by the patient themselves: no notice', () => {
    const plan = planMessages({ startTime: START, event: { type: 'cancelled', notifyPatient: false }, policy, timeZone: TZ, now, channels: ['SMS'] })
    expect(plan).toEqual([])
  })

  it('replan (reminders switched on / import): reminders only', () => {
    const plan = planMessages({ startTime: START, event: { type: 'replan' }, policy, timeZone: TZ, now, channels: ['SMS'] })
    expect(plan.map((m) => m.kind)).toEqual(['REMINDER_DAY_BEFORE'])
  })

  it('past appointments get nothing', () => {
    const plan = planMessages({ startTime: new Date('2026-10-01T09:00:00Z'), event: { type: 'replan' }, policy, timeZone: TZ, now, channels: ['SMS'] })
    expect(plan).toEqual([])
  })
})

describe('sending window', () => {
  it('night → next morning at quiet start', () => {
    expect(intoSendingWindow(new Date('2026-10-19T21:30:00Z'), policy.quietHours, TZ).toISOString()).toBe('2026-10-20T08:00:00.000Z')
  })
  it('inside the window is untouched', () => {
    const at = new Date('2026-10-19T12:00:00Z')
    expect(intoSendingWindow(at, policy.quietHours, TZ)).toBe(at)
  })
})

describe('patient link', () => {
  it('is stable per appointment, 12 base62 characters, and different between appointments', () => {
    const a = appointmentLinkToken('appt-1')
    expect(a).toMatch(/^[0-9A-Za-z]{12}$/)
    expect(appointmentLinkToken('appt-1')).toBe(a)
    expect(appointmentLinkToken('appt-2')).not.toBe(a)
    expect(hashLinkToken(a)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('dedupe key changes when the time changes (a moved slot gets fresh messages)', () => {
    expect(dedupeKey('a', 'REMINDER_DAY_BEFORE', 'SMS', START)).not.toBe(dedupeKey('a', 'REMINDER_DAY_BEFORE', 'SMS', new Date(START.getTime() + 3_600_000)))
  })
})
