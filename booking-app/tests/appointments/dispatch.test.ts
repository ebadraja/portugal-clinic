import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => {
  const prisma = {
    $queryRaw: vi.fn(),
    appointmentNotification: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), findMany: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    appointmentEvent: { create: vi.fn().mockResolvedValue({}) },
    appointment: { update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    settings: { updateMany: vi.fn().mockResolvedValue({}) },
  }
  return { prisma, optedOut: vi.fn().mockResolvedValue(false) }
})
vi.mock('@/lib/prisma', () => ({ prisma: m.prisma, default: m.prisma }))
vi.mock('@/lib/messaging/optOut', () => ({ isPatientOptedOutByAnyRoute: m.optedOut }))
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn() }))

import { runDispatch, startFromKey, type Senders } from '@/lib/appointments/dispatch'
import { buildClinicSettings, type ClinicSettings } from '@/lib/clinic/settings'

const base = buildClinicSettings({ practicePhone: '928 494 871' })
const on: ClinicSettings = { ...base, flags: { agendaV2: true, reminders: true } }
// Wed 21 Oct 2026 10:00 Lisbon (09:00 UTC); appointment Thu 22 Oct 10:30 Lisbon
const NOW = new Date('2026-10-21T09:00:00Z')
const START = new Date('2026-10-22T09:30:00Z')

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'n1', kind: 'REMINDER_DAY_BEFORE', channel: 'SMS', attempts: 1,
    dedupeKey: `a1:REMINDER_DAY_BEFORE:SMS:${START.toISOString()}`,
    appointment: { id: 'a1', startTime: START, endTime: new Date(START.getTime() + 30 * 60_000), status: 'SCHEDULED', provider: 'Dra. Ana Nunes' },
    patient: { id: 'p1', firstName: 'Maria', phone: '912 345 678', email: 'maria@example.pt', smsRemindersEnabled: true },
    ...over,
  }
}

function senders(ok = true): Senders & { sms: ReturnType<typeof vi.fn>; email: ReturnType<typeof vi.fn> } {
  return {
    sms: vi.fn().mockResolvedValue(ok ? { ok: true, id: 'SM123' } : { ok: false, error: 'carrier down' }),
    email: vi.fn().mockResolvedValue({ ok: true, id: 'em1' }),
  }
}

// Success is recorded with update(); skips/retries/failures only while the row is still SENDING.
const lastUpdate = () => m.prisma.appointmentNotification.update.mock.calls.at(-1)?.[0]
const lastRelease = () => m.prisma.appointmentNotification.updateMany.mock.calls.at(-1)?.[0]

beforeEach(() => {
  vi.clearAllMocks()
  m.prisma.$queryRaw.mockResolvedValue([{ id: 'n1' }])
  m.optedOut.mockResolvedValue(false)
})

describe('runDispatch', () => {
  it('nothing due: no work, heartbeat still written', async () => {
    m.prisma.$queryRaw.mockResolvedValue([])
    const r = await runDispatch({ now: NOW, settings: on, senders: senders() })
    expect(r.claimed).toBe(0)
    expect(m.prisma.settings.updateMany).toHaveBeenCalled()
  })

  it('sends the SMS in plain characters with the patient link, records SID + history', async () => {
    m.prisma.appointmentNotification.findMany.mockResolvedValue([row()])
    const s = senders()
    const r = await runDispatch({ now: NOW, settings: on, senders: s })
    expect(r.sent).toBe(1)
    const [to, body] = s.sms.mock.calls[0]
    expect(to).toBe('+351912345678')
    expect(body).toMatch(/^Clinica Dentaria Nunes Monteiro: lembrete da sua consulta amanha, 22\/10, as 10:30\. Confirme ou desmarque: http.*\/c\/[0-9A-Za-z]{12}$/)
    expect(lastUpdate()).toMatchObject({ where: { id: 'n1' }, data: { status: 'SENT', providerMessageId: 'SM123' } })
    expect(m.prisma.appointmentEvent.create.mock.calls[0][0].data).toMatchObject({ kind: 'NOTIFICATION_SENT', actor: 'SYSTEM' })
  })

  it('reminders switched off: claimed rows are skipped, never sent', async () => {
    m.prisma.appointmentNotification.findMany.mockResolvedValue([row()])
    const s = senders()
    const r = await runDispatch({ now: NOW, settings: base, senders: s })
    expect(r.skipped).toBe(1)
    expect(s.sms).not.toHaveBeenCalled()
  })

  it('a moved appointment’s old reminder is skipped', async () => {
    m.prisma.appointmentNotification.findMany.mockResolvedValue([row({ dedupeKey: 'a1:REMINDER_DAY_BEFORE:SMS:2026-10-20T09:30:00.000Z' })])
    const s = senders()
    await runDispatch({ now: NOW, settings: on, senders: s })
    expect(s.sms).not.toHaveBeenCalled()
    expect(lastRelease()).toMatchObject({ where: { id: 'n1', status: 'SENDING' }, data: { status: 'SKIPPED', error: 'appointment was moved' } })
  })

  it('a cancelled appointment gets no reminder (but does get its cancellation notice)', async () => {
    const cancelled = { ...row().appointment, status: 'CANCELLED' }
    m.prisma.appointmentNotification.findMany.mockResolvedValue([row({ appointment: cancelled })])
    const s = senders()
    await runDispatch({ now: NOW, settings: on, senders: s })
    expect(s.sms).not.toHaveBeenCalled()

    vi.clearAllMocks()
    m.prisma.$queryRaw.mockResolvedValue([{ id: 'n1' }])
    m.prisma.appointmentNotification.findMany.mockResolvedValue([row({ kind: 'CANCELLED', dedupeKey: `a1:CANCELLED:SMS:${START.toISOString()}`, appointment: cancelled })])
    await runDispatch({ now: NOW, settings: on, senders: s })
    expect(s.sms.mock.calls[0][1]).toMatch(/foi desmarcada/)
  })

  it('respects SMS opt-out', async () => {
    m.optedOut.mockResolvedValue(true)
    m.prisma.appointmentNotification.findMany.mockResolvedValue([row()])
    const s = senders()
    await runDispatch({ now: NOW, settings: on, senders: s })
    expect(s.sms).not.toHaveBeenCalled()
    expect(lastRelease().data.error).toMatch(/opted out/)
  })

  it('a late run at night waits for the morning instead of texting', async () => {
    m.prisma.appointmentNotification.findMany.mockResolvedValue([row()])
    const s = senders()
    const night = new Date('2026-10-21T21:30:00Z') // 22:30 Lisbon
    const r = await runDispatch({ now: night, settings: on, senders: s })
    // Next morning 09:00 is less than 30 min before the 10:30 visit? No — 1h30 before: deferred.
    expect(r.deferred).toBe(1)
    expect(s.sms).not.toHaveBeenCalled()
    expect(lastRelease().data.sendAt.toISOString()).toBe('2026-10-22T08:00:00.000Z')
  })

  it('a failed send is retried with back-off, then marked FAILED', async () => {
    m.prisma.appointmentNotification.findMany.mockResolvedValue([row({ attempts: 1 })])
    const r1 = await runDispatch({ now: NOW, settings: on, senders: senders(false) })
    expect(r1.retried).toBe(1)
    expect(lastRelease()).toMatchObject({ where: { id: 'n1', status: 'SENDING' }, data: { status: 'PENDING', error: 'carrier down' } })
    expect(lastRelease().data.sendAt.toISOString()).toBe('2026-10-21T09:05:00.000Z')

    m.prisma.appointmentNotification.findMany.mockResolvedValue([row({ attempts: 3 })])
    const r2 = await runDispatch({ now: NOW, settings: on, senders: senders(false) })
    expect(r2.failed).toBe(1)
    expect(lastRelease().data.status).toBe('FAILED')
    expect(m.prisma.appointmentEvent.create.mock.calls.at(-1)?.[0].data.kind).toBe('NOTIFICATION_FAILED')
  })

  it('email channel uses the HTML template with calendar links', async () => {
    m.prisma.appointmentNotification.findMany.mockResolvedValue([row({ channel: 'EMAIL', dedupeKey: `a1:REMINDER_DAY_BEFORE:EMAIL:${START.toISOString()}` })])
    const s = senders()
    await runDispatch({ now: NOW, settings: on, senders: s })
    const [to, subject, html] = s.email.mock.calls[0]
    expect(to).toBe('maria@example.pt')
    expect(subject).toMatch(/^Lembrete: a sua consulta é amanhã/)
    expect(html).toContain('calendar.google.com')
    expect(html).toContain('/ics')
    expect(html).not.toMatch(/Avaliação|Higiene/) // no treatment details
  })

  it('stale SENDING locks are released first', async () => {
    m.prisma.$queryRaw.mockResolvedValue([])
    await runDispatch({ now: NOW, settings: on, senders: senders() })
    expect(m.prisma.appointmentNotification.updateMany.mock.calls[0][0]).toMatchObject({ where: { status: 'SENDING' }, data: { status: 'PENDING' } })
  })
})

describe('startFromKey', () => {
  it('recovers the ISO time even though it contains colons', () => {
    expect(startFromKey('a1:CONFIRMATION:SMS:2026-10-22T09:30:00.000Z')).toBe('2026-10-22T09:30:00.000Z')
  })
})
