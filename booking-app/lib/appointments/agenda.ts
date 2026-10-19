/**
 * Read side of the agenda: everything the calendar needs for a date range in one query set,
 * with times as clinic wall-clock strings ("YYYY-MM-DDTHH:mm") so the browser never has to
 * know about time zones.
 */
import prisma from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'
import { type ClinicSettings, closureOn, providerByName } from '@/lib/clinic/settings'
import { addDays, dayBoundsUtc, utcToZoned } from '@/lib/clinic/time'
import { digitsOnly } from '@/lib/clinic/phone'
import { INACTIVE_STATUSES, busyFor, computeDaySlots, providerWindowsOn } from '@/lib/appointments/availability'

export const MAX_RANGE_DAYS = 62

export function wallClock(d: Date, timeZone: string): string {
  const z = utcToZoned(d, timeZone)
  return `${z.date}T${z.time}`
}

export type ReminderState = 'none' | 'pending' | 'sent' | 'delivered' | 'failed'

/** One badge per appointment: the most informative state of its messages. */
export function reminderState(rows: { status: string; deliveryStatus: string | null }[]): ReminderState {
  const live = rows.filter((r) => r.status !== 'CANCELLED' && r.status !== 'SKIPPED')
  if (live.length === 0) return 'none'
  if (live.some((r) => r.status === 'FAILED' || r.deliveryStatus === 'failed' || r.deliveryStatus === 'undelivered')) return 'failed'
  if (live.some((r) => r.deliveryStatus === 'delivered')) return 'delivered'
  if (live.some((r) => r.status === 'SENT')) return 'sent'
  return 'pending'
}

function birthdayWithin(dob: Date | null, from: string, to: string): boolean {
  if (!dob) return false
  const md = dob.toISOString().slice(5, 10)
  for (let d = from; d <= to; d = addDays(d, 1)) if (d.slice(5, 10) === md) return true
  return false
}

const APPOINTMENT_INCLUDE = {
  patient: {
    select: { id: true, firstName: true, lastName: true, phone: true, dateOfBirth: true, allergies: true, totalVisits: true },
  },
  notifications: { select: { status: true, deliveryStatus: true } },
} satisfies Prisma.AppointmentInclude

type AppointmentWithPatient = Prisma.AppointmentGetPayload<{ include: typeof APPOINTMENT_INCLUDE }>

export function serializeAgendaAppointment(a: AppointmentWithPatient, settings: Pick<ClinicSettings, 'timezone' | 'providers'>) {
  const z = utcToZoned(a.startTime, settings.timezone)
  const weekEnd = addDays(z.date, 6 - ((z.weekday + 6) % 7)) // Sunday of that week
  const weekStart = addDays(weekEnd, -6)
  return {
    id: a.id,
    patientId: a.patientId,
    patientName: `${a.patient.firstName} ${a.patient.lastName}`.trim(),
    patientPhone: a.patient.phone,
    start: wallClock(a.startTime, settings.timezone),
    end: wallClock(a.endTime, settings.timezone),
    startUtc: a.startTime.toISOString(),
    duration: a.duration,
    type: a.type,
    status: a.status,
    providerId: a.providerId ?? providerByName(a.provider, settings.providers)?.id ?? null,
    provider: a.provider,
    reason: a.reason,
    notes: a.notes,
    bookedVia: a.bookedVia,
    confirmedAt: a.confirmedAt?.toISOString() ?? null,
    confirmedVia: a.confirmedVia,
    checkedInAt: a.checkedInAt?.toISOString() ?? null,
    seriesId: a.seriesId,
    allowedOverlap: a.allowedOverlap,
    reminder: reminderState(a.notifications),
    alerts: {
      allergy: !!a.patient.allergies?.trim(),
      birthday: birthdayWithin(a.patient.dateOfBirth, weekStart, weekEnd),
      newPatient: a.patient.totalVisits === 0,
      dobMissing: !a.patient.dateOfBirth,
    },
  }
}

export type AgendaAppointment = ReturnType<typeof serializeAgendaAppointment>

export async function loadAgenda(input: { from: string; to: string; includeCancelled: boolean; settings: ClinicSettings }) {
  const { settings } = input
  const start = dayBoundsUtc(input.from, settings.timezone).start
  const end = dayBoundsUtc(input.to, settings.timezone).end
  const [appointments, blocks] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        startTime: { lt: end },
        endTime: { gt: start },
        ...(!input.includeCancelled && { status: { notIn: [...INACTIVE_STATUSES] } }),
      },
      orderBy: { startTime: 'asc' },
      include: APPOINTMENT_INCLUDE,
      take: 5000,
    }),
    prisma.calendarBlock.findMany({
      where: { startTime: { lt: end }, endTime: { gt: start } },
      orderBy: { startTime: 'asc' },
      take: 2000,
    }),
  ])

  const closures: { date: string; name: string }[] = []
  for (let d = input.from; d <= input.to; d = addDays(d, 1)) {
    const name = closureOn(d, settings.holidays)
    if (name) closures.push({ date: d, name })
  }

  return {
    timezone: settings.timezone,
    locale: settings.locale,
    from: input.from,
    to: input.to,
    serverTime: new Date().toISOString(),
    today: utcToZoned(new Date(), settings.timezone).date,
    providers: settings.providers.map((p) => ({ id: p.id, name: p.name, title: p.title, color: p.color, active: p.active, workingHours: p.workingHours, appointmentTypes: p.appointmentTypes, agentBookable: p.agentBookable, userId: p.userId })),
    appointmentTypes: settings.appointmentTypes.map((t) => ({ type: t.type, label: t.label, color: t.color, durationMinutes: t.durationMinutes, active: t.active })),
    businessHours: settings.businessHours,
    lunchBreak: settings.lunchBreak,
    slotMinutes: settings.bookingPolicy.slotMinutes,
    closures,
    appointments: appointments.map((a) => serializeAgendaAppointment(a, settings)),
    blocks: blocks.map((b) => ({
      id: b.id,
      providerId: b.providerId,
      start: wallClock(b.startTime, settings.timezone),
      end: wallClock(b.endTime, settings.timezone),
      kind: b.kind,
      reason: b.reason,
      seriesId: b.seriesId,
    })),
  }
}

export type AgendaPayload = Awaited<ReturnType<typeof loadAgenda>>

// ─── Detail drawer ───────────────────────────────────────────────────────────

export async function loadAppointmentDetail(id: string, settings: ClinicSettings) {
  const a = await prisma.appointment.findUnique({
    where: { id },
    include: {
      patient: {
        select: {
          id: true, firstName: true, lastName: true, phone: true, email: true, dateOfBirth: true, allergies: true,
          medicalNotes: true, totalVisits: true, lastVisitAt: true, nif: true, smsRemindersEnabled: true, externalId: true,
        },
      },
      events: { orderBy: { createdAt: 'asc' }, take: 200 },
      notifications: { orderBy: { sendAt: 'asc' }, take: 100 },
      callLog: { select: { id: true, summary: true, recordingUrl: true, startTime: true } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  })
  if (!a) return null
  const [noShows, upcoming] = await Promise.all([
    prisma.appointment.count({ where: { patientId: a.patientId, status: 'NO_SHOW' } }),
    prisma.appointment.findMany({
      where: { patientId: a.patientId, startTime: { gt: new Date() }, status: { in: ['SCHEDULED', 'CONFIRMED'] }, id: { not: a.id } },
      orderBy: { startTime: 'asc' },
      take: 3,
      select: { id: true, startTime: true, type: true },
    }),
  ])
  const userIds = [...new Set(a.events.map((e) => e.userId).filter((u): u is string => !!u))]
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
    : []
  const nameOf = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]))

  return {
    id: a.id,
    start: wallClock(a.startTime, settings.timezone),
    end: wallClock(a.endTime, settings.timezone),
    duration: a.duration,
    type: a.type,
    status: a.status,
    providerId: a.providerId ?? providerByName(a.provider, settings.providers)?.id ?? null,
    provider: a.provider,
    reason: a.reason,
    notes: a.notes,
    bookedVia: a.bookedVia,
    confirmedAt: a.confirmedAt?.toISOString() ?? null,
    confirmedVia: a.confirmedVia,
    checkedInAt: a.checkedInAt?.toISOString() ?? null,
    cancelReason: a.cancelReason,
    seriesId: a.seriesId,
    allowedOverlap: a.allowedOverlap,
    externalId: a.externalId,
    createdAt: a.createdAt.toISOString(),
    createdBy: a.createdBy ? `${a.createdBy.firstName} ${a.createdBy.lastName}`.trim() : null,
    patient: {
      id: a.patient.id,
      name: `${a.patient.firstName} ${a.patient.lastName}`.trim(),
      phone: a.patient.phone,
      email: a.patient.email,
      dateOfBirth: a.patient.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      allergies: a.patient.allergies,
      medicalAlert: a.patient.medicalNotes ? a.patient.medicalNotes.slice(0, 200) : null,
      totalVisits: a.patient.totalVisits,
      lastVisitAt: a.patient.lastVisitAt?.toISOString() ?? null,
      noShows,
      nif: a.patient.nif,
      smsRemindersEnabled: a.patient.smsRemindersEnabled,
      importedFrom: a.patient.externalId?.startsWith('zappy:') ? 'Zappy' : null,
    },
    upcoming: upcoming.map((u) => ({ id: u.id, start: wallClock(u.startTime, settings.timezone), type: u.type })),
    callLog: a.callLog ? { id: a.callLog.id, summary: a.callLog.summary, hasRecording: !!a.callLog.recordingUrl, at: a.callLog.startTime.toISOString() } : null,
    events: a.events.map((e) => ({
      id: e.id,
      kind: e.kind,
      actor: e.actor,
      by: e.userId ? nameOf.get(e.userId) ?? 'Staff' : null,
      vapiCallId: e.vapiCallId,
      data: e.data,
      at: e.createdAt.toISOString(),
    })),
    notifications: a.notifications.map((n) => ({
      id: n.id,
      kind: n.kind,
      channel: n.channel,
      status: n.status,
      deliveryStatus: n.deliveryStatus,
      sendAt: n.sendAt.toISOString(),
      sentAt: n.sentAt?.toISOString() ?? null,
      error: n.error,
    })),
  }
}

// ─── Patient search for the booking popover ──────────────────────────────────

/** Every word must match a name, phone, NIF or email — "maria santos", "912 345", "2345678". */
export async function searchPatients(q: string, limit = 8) {
  const words = q.trim().split(/\s+/).filter((w) => w.length > 0).slice(0, 5)
  if (words.length === 0) return []
  const and: Prisma.PatientWhereInput[] = words.map((w) => {
    const digits = digitsOnly(w)
    return {
      OR: [
        { firstName: { contains: w, mode: 'insensitive' } },
        { lastName: { contains: w, mode: 'insensitive' } },
        { email: { contains: w, mode: 'insensitive' } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }, { nif: { contains: digits } }] : []),
      ],
    }
  })
  // A phone typed with spaces ("912 345 678") is one search for its digits.
  const allDigits = digitsOnly(q)
  const where: Prisma.PatientWhereInput = {
    status: { notIn: ['ARCHIVED', 'DRAFT'] },
    OR: [{ AND: and }, ...(allDigits.length >= 6 && /^[\d\s+()-]+$/.test(q.trim()) ? [{ phone: { contains: allDigits.slice(-9) } }] : [])],
  }
  const rows = await prisma.patient.findMany({
    where,
    take: limit,
    orderBy: [{ lastVisitAt: { sort: 'desc', nulls: 'last' } }, { lastName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, phone: true, dateOfBirth: true, preferredProvider: true, totalVisits: true },
  })
  return rows.map((p) => ({
    id: p.id,
    name: `${p.firstName} ${p.lastName}`.trim(),
    phone: p.phone,
    dateOfBirth: p.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    preferredProvider: p.preferredProvider,
    totalVisits: p.totalVisits,
  }))
}

// ─── Next free slots ("Próximas vagas") ──────────────────────────────────────

export async function findNextFreeSlots(input: {
  settings: ClinicSettings
  type: string
  providerId?: string | null
  fromDate: string
  limit: number
  now?: Date
}): Promise<{ date: string; time: string; providerId: string | null }[]> {
  const { settings } = input
  const cfg = settings.appointmentTypes.find((t) => t.type === input.type)
  const duration = cfg?.durationMinutes ?? settings.bookingPolicy.slotMinutes
  const providers = input.providerId
    ? settings.providers.filter((p) => p.id === input.providerId)
    : settings.providers.filter((p) => p.active && (p.appointmentTypes.length === 0 || p.appointmentTypes.includes(input.type)))
  const out: { date: string; time: string; providerId: string | null }[] = []
  const now = input.now ?? new Date()
  for (let i = 0; i < Math.min(60, settings.bookingPolicy.maxDaysAhead + 1) && out.length < input.limit; i++) {
    const date = addDays(input.fromDate, i)
    for (const provider of providers.length > 0 ? providers : [null]) {
      const busy = await busyFor(prisma, date, settings, { providerId: provider?.id ?? null })
      const { slots, closedReason } = computeDaySlots({
        date, durationMinutes: duration, bufferMinutes: cfg?.bufferMinutes ?? 0, rules: settings, booked: busy.booked, blocks: busy.blocks,
        providerWindows: providerWindowsOn(date, provider), now, enforceNotice: false,
      })
      if (closedReason === 'too_far') return out
      for (const s of slots) out.push({ date, time: s.startTime, providerId: provider?.id ?? null })
    }
  }
  return out
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, input.limit)
}

