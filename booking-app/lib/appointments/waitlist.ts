/**
 * Waiting list ("lista de espera"): patients who want an earlier slot than the agenda had.
 * When a time frees up (a cancellation, a no-show, a free slot the desk is looking at), the
 * agenda lists the entries that fit it, oldest first, so the desk knows who to call.
 */
import prisma from '@/lib/prisma'
import type { AppointmentType } from '@/lib/generated/prisma/client'
import type { ClinicSettings } from '@/lib/clinic/settings'
import { clinicalAlerts } from '@/lib/patients/alerts'
import { wallClock } from '@/lib/appointments/agenda'
import { entryFitsSlot, type SlotQuery, type TimeOfDay } from '@/lib/appointments/waitlistMatch'

export { AFTERNOON_FROM, TIMES_OF_DAY, entryFitsSlot, type MatchableEntry, type SlotQuery, type TimeOfDay } from '@/lib/appointments/waitlistMatch'

const ENTRY_INCLUDE = {
  patient: { select: { id: true, firstName: true, lastName: true, phone: true, phone2: true, allergies: true, medicalNotes: true, tags: true } },
} as const

export async function listWaitlist(settings: ClinicSettings, opts: { patientId?: string } = {}) {
  const rows = await prisma.waitlistEntry.findMany({
    where: { status: 'ACTIVE', ...(opts.patientId && { patientId: opts.patientId }) },
    orderBy: { createdAt: 'asc' },
    include: ENTRY_INCLUDE,
    take: 500,
  })
  const currentIds = rows.map((r) => r.currentAppointmentId).filter((x): x is string => !!x)
  const current = currentIds.length
    ? await prisma.appointment.findMany({ where: { id: { in: currentIds }, status: { in: ['SCHEDULED', 'CONFIRMED'] } }, select: { id: true, startTime: true } })
    : []
  const startOf = new Map(current.map((a) => [a.id, wallClock(a.startTime, settings.timezone)]))
  return rows.map((r) => ({
    id: r.id,
    patientId: r.patientId,
    patientName: `${r.patient.firstName} ${r.patient.lastName}`.trim(),
    patientPhone: r.patient.phone ?? r.patient.phone2,
    alerts: clinicalAlerts(r.patient).map((a) => a.label),
    type: r.type as string | null,
    providerId: r.providerId,
    fromDate: r.fromDate,
    untilDate: r.untilDate,
    timeOfDay: r.timeOfDay,
    notes: r.notes,
    status: r.status,
    currentAppointmentId: r.currentAppointmentId && startOf.has(r.currentAppointmentId) ? r.currentAppointmentId : null,
    currentStart: (r.currentAppointmentId && startOf.get(r.currentAppointmentId)) ?? null,
    createdAt: r.createdAt.toISOString(),
  }))
}

export type WaitlistItem = Awaited<ReturnType<typeof listWaitlist>>[number]

export async function waitlistMatches(slot: SlotQuery, settings: ClinicSettings): Promise<WaitlistItem[]> {
  const durationOf = (t: string) => settings.appointmentTypes.find((x) => x.type === t)?.durationMinutes ?? null
  return (await listWaitlist(settings)).filter((e) => entryFitsSlot(e, slot, durationOf))
}

export type WaitlistInput = {
  patientId: string
  type?: AppointmentType | null
  providerId?: string | null
  fromDate: string
  untilDate?: string | null
  timeOfDay?: TimeOfDay
  notes?: string | null
  currentAppointmentId?: string | null
}

/** One active entry per patient: adding again updates the existing one. */
export async function upsertWaitlistEntry(input: WaitlistInput, userId: string | null) {
  const data = {
    type: input.type ?? null,
    providerId: input.providerId ?? null,
    fromDate: input.fromDate,
    untilDate: input.untilDate ?? null,
    timeOfDay: input.timeOfDay ?? 'ANY',
    notes: input.notes ?? null,
    currentAppointmentId: input.currentAppointmentId ?? null,
  }
  const existing = await prisma.waitlistEntry.findFirst({ where: { patientId: input.patientId, status: 'ACTIVE' }, select: { id: true } })
  if (existing) return { entry: await prisma.waitlistEntry.update({ where: { id: existing.id }, data }), created: false }
  return { entry: await prisma.waitlistEntry.create({ data: { ...data, patientId: input.patientId, createdById: userId } }), created: true }
}

/** Called after a booking made from the waiting list succeeds. */
export async function markWaitlistBooked(entryId: string, appointmentId: string) {
  await prisma.waitlistEntry.updateMany({ where: { id: entryId, status: 'ACTIVE' }, data: { status: 'BOOKED', bookedAppointmentId: appointmentId } })
}
