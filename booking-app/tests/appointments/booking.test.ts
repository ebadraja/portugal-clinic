import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ locked: 1 }]),
    appointment: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), aggregate: vi.fn() },
    calendarBlock: { findMany: vi.fn() },
    appointmentEvent: { create: vi.fn().mockResolvedValue({}) },
    appointmentNotification: { updateMany: vi.fn(), createMany: vi.fn() },
    patient: { update: vi.fn().mockResolvedValue({}) },
  }
  const prisma = {
    patient: { findUnique: vi.fn() },
    appointment: { findUnique: vi.fn(), update: vi.fn() },
    appointmentEvent: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  }
  return { prisma, tx }
})
vi.mock('@/lib/prisma', () => ({ prisma: m.prisma, default: m.prisma }))

import { createAppointment, createSeries, rescheduleAppointment, setAppointmentStatus, type Actor } from '@/lib/appointments/booking'
import { buildClinicSettings, DEFAULT_PROVIDERS, type ClinicSettings } from '@/lib/clinic/settings'

const ANA = DEFAULT_PROVIDERS[0]
const RUI = { ...ANA, id: 'rui-lopes', name: 'Dr. Rui Lopes', color: '#10b981' }
const two = (over: Partial<ClinicSettings> = {}): ClinicSettings => ({ ...buildClinicSettings(null), providers: [ANA, RUI], ...over })
const withReminders = (s: ClinicSettings): ClinicSettings => ({ ...s, flags: { ...s.flags, reminders: true } })

// Saturday 17 Oct 2026 10:00 Lisbon
const NOW = new Date('2026-10-17T09:00:00Z')
const STAFF: Actor = { kind: 'STAFF', userId: 'u1', role: 'STAFF' }
const VIEWER: Actor = { kind: 'STAFF', userId: 'u2', role: 'VIEWER' }
const VOICE: Actor = { kind: 'VOICE_AGENT', callId: 'call-9' }

const PATIENT = { id: 'p1', firstName: 'Maria', lastName: 'Santos', preferredProvider: null, status: 'ACTIVE', phone: '+351912345678', email: 'm@example.pt', smsRemindersEnabled: true }
const input = { patientId: 'p1', date: '2026-10-19', time: '10:00', type: 'EVALUATION' as const }
// 10:00–10:30 Lisbon on 19 Oct = 09:00–09:30 UTC
const busy10 = { startTime: new Date('2026-10-19T09:00:00Z'), endTime: new Date('2026-10-19T09:30:00Z'), type: 'EVALUATION' }

beforeEach(() => {
  vi.clearAllMocks()
  m.prisma.patient.findUnique.mockResolvedValue(PATIENT)
  m.tx.appointment.findMany.mockResolvedValue([])
  m.tx.calendarBlock.findMany.mockResolvedValue([])
  // The fake database remembers created rows so update() returns the real row, like Prisma.
  const rows = new Map<string, Record<string, unknown>>()
  m.tx.appointment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const row = { id: 'new-1', ...data }
    rows.set(row.id, row)
    return row
  })
  m.tx.appointment.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const row = {
      ...(rows.get(where.id) ?? { id: where.id, patientId: 'p1', startTime: new Date('2026-10-19T09:00:00Z'), endTime: new Date('2026-10-19T09:30:00Z'), status: 'SCHEDULED', providerId: 'ana-nunes' }),
      ...data,
    }
    rows.set(where.id, row)
    return row
  })
  m.tx.appointment.aggregate.mockResolvedValue({ _count: { _all: 0 }, _max: { startTime: null } })
  m.tx.appointmentNotification.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }))
  m.tx.appointmentNotification.updateMany.mockResolvedValue({ count: 0 })
})

describe('createAppointment — staff', () => {
  it('books a free slot with the chosen dentist, keeps the name in sync and stores the link hash', async () => {
    const r = await createAppointment({ ...input, providerId: 'rui-lopes' }, STAFF, { settings: two(), now: NOW })
    expect(r.ok).toBe(true)
    const data = m.tx.appointment.create.mock.calls[0][0].data
    expect(data).toMatchObject({ providerId: 'rui-lopes', provider: 'Dr. Rui Lopes', bookedVia: 'STAFF', createdById: 'u1', duration: 30 })
    expect(m.tx.appointment.update.mock.calls[0][0].data.publicTokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(m.tx.appointmentEvent.create.mock.calls[0][0].data).toMatchObject({ kind: 'CREATED', actor: 'STAFF', userId: 'u1' })
    expect(m.prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'CREATE', entity: 'appointment', userId: 'u1' })
  })

  it('only the dentist’s own appointments (and unassigned legacy ones) count as busy', async () => {
    await createAppointment({ ...input, providerId: 'rui-lopes' }, STAFF, { settings: two(), now: NOW })
    expect(m.tx.appointment.findMany.mock.calls[0][0].where.OR).toEqual([{ providerId: 'rui-lopes' }, { providerId: null }])
  })

  it('outside opening hours: asks to confirm, then books with the warning recorded', async () => {
    const first = await createAppointment({ ...input, time: '19:00', providerId: 'ana-nunes' }, STAFF, { settings: two(), now: NOW })
    expect(first).toMatchObject({ ok: false, code: 'needs_confirmation' })
    expect(m.tx.appointment.create).not.toHaveBeenCalled()

    const second = await createAppointment({ ...input, time: '19:00', providerId: 'ana-nunes', acknowledgeWarnings: true }, STAFF, { settings: two(), now: NOW })
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.warnings.map((w) => w.reason)).toEqual(['outside_hours'])
  })

  it('an overlap is refused unless the user deliberately double-books', async () => {
    m.tx.appointment.findMany.mockResolvedValue([busy10])
    const refused = await createAppointment({ ...input, providerId: 'ana-nunes' }, STAFF, { settings: two(), now: NOW })
    expect(refused).toMatchObject({ ok: false, code: 'slot', reason: 'conflict' })

    const forced = await createAppointment({ ...input, providerId: 'ana-nunes', allowOverlap: true, acknowledgeWarnings: true }, STAFF, { settings: two(), now: NOW })
    expect(forced.ok).toBe(true)
    expect(m.tx.appointment.create.mock.calls[0][0].data.allowedOverlap).toBe(true)
  })

  it('an existing appointment’s buffer is respected', async () => {
    // Restorative 09:30–10:00 Lisbon with a 10-minute buffer → 10:00 is not free
    m.tx.appointment.findMany.mockResolvedValue([{ startTime: new Date('2026-10-19T08:30:00Z'), endTime: new Date('2026-10-19T09:00:00Z'), type: 'RESTORATIVE' }])
    const r = await createAppointment({ ...input, providerId: 'ana-nunes' }, STAFF, { settings: two(), now: NOW })
    expect(r).toMatchObject({ ok: false, reason: 'conflict' })
  })

  it('VIEWER is read-only', async () => {
    const r = await createAppointment(input, VIEWER, { settings: two(), now: NOW })
    expect(r).toMatchObject({ ok: false, code: 'forbidden' })
    expect(m.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('unknown dentist is refused', async () => {
    expect(await createAppointment({ ...input, providerId: 'nobody' }, STAFF, { settings: two(), now: NOW })).toMatchObject({ ok: false, code: 'invalid' })
  })
})

describe('createAppointment — voice agent', () => {
  it('every rule is hard: outside hours is refused, not a warning', async () => {
    const r = await createAppointment({ ...input, time: '19:00' }, VOICE, { settings: two(), now: NOW })
    expect(r).toMatchObject({ ok: false, code: 'slot', reason: 'outside_hours' })
  })

  it('books the next free dentist when the first is busy', async () => {
    m.tx.appointment.findMany.mockImplementation(async ({ where }: { where: { OR?: { providerId: string | null }[] } }) =>
      where.OR?.[0]?.providerId === 'ana-nunes' ? [busy10] : [],
    )
    const r = await createAppointment(input, VOICE, { settings: two(), now: NOW })
    expect(r.ok).toBe(true)
    expect(m.tx.appointment.create.mock.calls[0][0].data).toMatchObject({ providerId: 'rui-lopes', bookedVia: 'VOICE_AGENT' })
    expect(m.prisma.auditLog.create.mock.calls[0][0].data.changes).toMatchObject({ source: 'voice_agent', vapiCallId: 'call-9' })
  })

  it('skips dentists who are not AI-bookable or do not do the type', async () => {
    const settings = two({ providers: [{ ...ANA, agentBookable: false }, { ...RUI, appointmentTypes: ['HYGIENE'] }] })
    const r = await createAppointment(input, VOICE, { settings, now: NOW })
    expect(r).toMatchObject({ ok: false, code: 'slot' })
    expect(m.tx.appointment.create).not.toHaveBeenCalled()
  })

  it('respects the dentist’s working hours', async () => {
    const settings = two({ providers: [{ ...ANA, workingHours: [{ weekday: 1, start: '14:00', end: '18:00' }] }] })
    const r = await createAppointment(input, VOICE, { settings, now: NOW })
    expect(r).toMatchObject({ ok: false, reason: 'provider_off' })
  })

  it('respects blocked time', async () => {
    m.tx.calendarBlock.findMany.mockResolvedValue([{ startTime: new Date('2026-10-19T08:30:00Z'), endTime: new Date('2026-10-19T11:30:00Z') }])
    const r = await createAppointment(input, VOICE, { settings: two({ providers: [ANA] }), now: NOW })
    expect(r).toMatchObject({ ok: false, reason: 'blocked' })
  })
})

describe('reminders are planned in the same transaction', () => {
  it('reminders on: confirmation + day-before written to the outbox', async () => {
    await createAppointment({ ...input, providerId: 'ana-nunes' }, STAFF, { settings: withReminders(two()), now: NOW })
    const rows = m.tx.appointmentNotification.createMany.mock.calls[0][0].data as { kind: string; channel: string; dedupeKey: string }[]
    expect(rows.map((r) => `${r.kind}/${r.channel}`)).toEqual(['CONFIRMATION/SMS', 'CONFIRMATION/EMAIL', 'REMINDER_DAY_BEFORE/SMS', 'REMINDER_DAY_BEFORE/EMAIL'])
    expect(rows[0].dedupeKey).toBe('new-1:CONFIRMATION:SMS:2026-10-19T09:00:00.000Z')
  })

  it('reminders off (default): nothing is planned', async () => {
    await createAppointment({ ...input, providerId: 'ana-nunes' }, STAFF, { settings: two(), now: NOW })
    expect(m.tx.appointmentNotification.createMany).not.toHaveBeenCalled()
  })

  it('patient opted out of SMS reminders: email only', async () => {
    m.prisma.patient.findUnique.mockResolvedValue({ ...PATIENT, smsRemindersEnabled: false })
    await createAppointment({ ...input, providerId: 'ana-nunes' }, STAFF, { settings: withReminders(two()), now: NOW })
    const rows = m.tx.appointmentNotification.createMany.mock.calls[0][0].data as { channel: string }[]
    expect(new Set(rows.map((r) => r.channel))).toEqual(new Set(['EMAIL']))
  })
})

describe('import', () => {
  it('records history as it was: no slot checks, no messages, no audit noise', async () => {
    m.tx.appointment.findMany.mockResolvedValue([busy10])
    const r = await createAppointment(
      { ...input, date: '2025-03-03', time: '19:30', providerId: 'ana-nunes', status: 'COMPLETED', externalId: 'zappy:77' },
      { kind: 'IMPORT' },
      { settings: withReminders(two()), now: NOW },
    )
    expect(r.ok).toBe(true)
    expect(m.tx.appointment.create.mock.calls[0][0].data).toMatchObject({ bookedVia: 'IMPORT', externalId: 'zappy:77', status: 'COMPLETED' })
    expect(m.tx.appointmentNotification.createMany).not.toHaveBeenCalled()
    expect(m.tx.patient.update).toHaveBeenCalled() // visit stats recounted
    expect(m.prisma.auditLog.create).not.toHaveBeenCalled()
  })
})

describe('rescheduleAppointment', () => {
  const existing = {
    id: 'a1', patientId: 'p1', startTime: new Date('2026-10-19T09:00:00Z'), endTime: new Date('2026-10-19T09:30:00Z'), duration: 30,
    type: 'EVALUATION', status: 'CONFIRMED', provider: 'Dra. Ana Nunes', providerId: 'ana-nunes', checkedInAt: null,
    patient: { phone: '+351912345678', email: null, smsRemindersEnabled: true },
  }

  it('moves in place, locks both days in date order, resets confirmation and replans', async () => {
    m.prisma.appointment.findUnique.mockResolvedValue(existing)
    const r = await rescheduleAppointment('a1', { date: '2026-10-20', time: '15:00' }, STAFF, { settings: withReminders(two()), now: NOW })
    expect(r.ok).toBe(true)
    const locks = m.tx.$queryRaw.mock.calls.map((c) => c[1])
    expect(locks).toEqual(['booking:2026-10-19', 'booking:2026-10-20'])
    expect(m.tx.appointment.update.mock.calls[0][0].data).toMatchObject({ status: 'SCHEDULED', confirmedAt: null })
    expect(m.tx.appointmentNotification.updateMany).toHaveBeenCalledWith({ where: { appointmentId: 'a1', status: { in: ['PENDING', 'SENDING'] } }, data: { status: 'CANCELLED' } })
    expect(m.tx.appointmentEvent.create.mock.calls[0][0].data.kind).toBe('RESCHEDULED')
    expect(m.prisma.auditLog.create.mock.calls[0][0].data.changes).toMatchObject({ action: 'rescheduled' })
  })

  it('the appointment does not conflict with itself', async () => {
    m.prisma.appointment.findUnique.mockResolvedValue(existing)
    await rescheduleAppointment('a1', { date: '2026-10-19', time: '10:00', durationMinutes: 45 }, STAFF, { settings: two(), now: NOW })
    expect(m.tx.appointment.findMany.mock.calls[0][0].where.id).toEqual({ not: 'a1' })
  })

  it('the voice agent cannot move a cancelled appointment', async () => {
    m.prisma.appointment.findUnique.mockResolvedValue({ ...existing, status: 'CANCELLED' })
    expect(await rescheduleAppointment('a1', { date: '2026-10-20', time: '15:00' }, VOICE, { settings: two(), now: NOW })).toMatchObject({ ok: false, code: 'invalid' })
  })
})

describe('setAppointmentStatus', () => {
  const appt = {
    id: 'a1', patientId: 'p1', startTime: new Date('2026-10-19T09:00:00Z'), endTime: new Date('2026-10-19T09:30:00Z'), duration: 30,
    type: 'EVALUATION', status: 'SCHEDULED', provider: 'Dra. Ana Nunes', providerId: 'ana-nunes', checkedInAt: null,
    patient: { phone: '+351912345678', email: null, smsRemindersEnabled: true },
  }

  it('a patient cancelling inside the notice window is flagged late, and gets no "cancelled" SMS', async () => {
    m.prisma.appointment.findUnique.mockResolvedValue(appt)
    const r = await setAppointmentStatus('a1', { status: 'CANCELLED' }, { kind: 'PATIENT' }, { settings: withReminders(two()), now: new Date('2026-10-18T20:00:00Z') })
    expect(r).toMatchObject({ ok: true, lateNotice: true })
    expect(m.tx.appointment.update.mock.calls[0][0].data.cancelReason).toBe('[Aviso tardio] Desmarcada pelo paciente')
    expect(m.tx.appointmentNotification.createMany).not.toHaveBeenCalled()
    expect(m.tx.appointmentNotification.updateMany).toHaveBeenCalled() // pending reminders cancelled
  })

  it('staff cancelling sends the patient a notice', async () => {
    m.prisma.appointment.findUnique.mockResolvedValue(appt)
    await setAppointmentStatus('a1', { status: 'CANCELLED', reason: 'Dentist ill' }, STAFF, { settings: withReminders(two()), now: NOW })
    const rows = m.tx.appointmentNotification.createMany.mock.calls[0][0].data as { kind: string }[]
    expect(rows.map((r) => r.kind)).toEqual(['CANCELLED'])
  })

  it('confirmation records how', async () => {
    m.prisma.appointment.findUnique.mockResolvedValue(appt)
    await setAppointmentStatus('a1', { status: 'CONFIRMED', via: 'link' }, { kind: 'PATIENT' }, { settings: two(), now: NOW })
    expect(m.tx.appointment.update.mock.calls[0][0].data).toMatchObject({ status: 'CONFIRMED', confirmedVia: 'link' })
  })

  it('completing recounts the patient’s visits from the record', async () => {
    m.prisma.appointment.findUnique.mockResolvedValue(appt)
    m.tx.appointment.aggregate.mockResolvedValue({ _count: { _all: 4 }, _max: { startTime: appt.startTime } })
    await setAppointmentStatus('a1', { status: 'COMPLETED' }, STAFF, { settings: two(), now: new Date('2026-10-19T10:00:00Z') })
    expect(m.tx.patient.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { totalVisits: 4, lastVisitAt: appt.startTime } })
  })

  it('bringing back a cancelled appointment re-checks the slot', async () => {
    m.prisma.appointment.findUnique.mockResolvedValue({ ...appt, status: 'CANCELLED' })
    m.tx.appointment.findMany.mockResolvedValue([busy10])
    const r = await setAppointmentStatus('a1', { status: 'SCHEDULED' }, STAFF, { settings: two(), now: NOW })
    expect(r).toMatchObject({ ok: false, reason: 'conflict' })
  })
})

describe('createSeries', () => {
  it('creates every N weeks and reports clashing dates instead of failing', async () => {
    m.tx.appointment.findMany.mockImplementation(async ({ where }: { where: { startTime: { lt: Date } } }) =>
      where.startTime.lt.toISOString().startsWith('2026-11-03') ? [{ startTime: new Date('2026-11-02T10:00:00Z'), endTime: new Date('2026-11-02T10:30:00Z'), type: 'EVALUATION' }] : [],
    )
    const r = await createSeries({ ...input, providerId: 'ana-nunes' }, { everyWeeks: 2, count: 3 }, STAFF, { settings: two(), now: NOW })
    if ('ok' in r) throw new Error('expected a series result')
    // 19 Oct, 2 Nov (10:00 Lisbon = 10:00 UTC in winter → clashes), 16 Nov
    expect(r.created).toHaveLength(2)
    expect(r.skipped.map((s) => s.date)).toEqual(['2026-11-02'])
    const seriesIds = new Set(m.tx.appointment.create.mock.calls.map((c) => c[0].data.seriesId))
    expect(seriesIds.size).toBe(1)
  })
})
