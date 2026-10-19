/**
 * The one place appointments are created, moved, cancelled or change status.
 *
 * Staff routes, the voice agent (Acácia), the patient's confirm/cancel link and the Zappy
 * importer are thin adapters over these functions, so the desk and the AI can never
 * disagree about whether a slot is free.
 *
 * Every write:
 *   - runs under the per-day advisory lock (two callers can't take the same slot),
 *   - is checked by the availability engine with the rules of the actor (below),
 *   - records an AppointmentEvent (history) and an audit-log entry,
 *   - rebuilds the patient's reminder plan in the same transaction.
 *
 * Rules by actor:
 *   VOICE_AGENT / PATIENT — every rule is hard (hours, lunch, holidays, dentist hours,
 *                           blocks, notice, horizon, overlap).
 *   STAFF                 — only overlap is hard, and an ADMIN/STAFF user may still
 *                           double-book on purpose (`allowOverlap`). Everything else is a
 *                           warning the user confirms (`acknowledgeWarnings`). VIEWER is read-only.
 *   IMPORT                — records history as it was; no checks, no messages.
 */
import prisma from '@/lib/prisma'
import type { AppointmentStatus, AppointmentType, BookingSource, Prisma, Role } from '@/lib/generated/prisma/client'
import {
  type ClinicSettings,
  type Provider,
  activeProviders,
  appointmentTypeConfig,
  getClinicSettings,
  providerById,
  providerByName,
  providerDoesType,
} from '@/lib/clinic/settings'
import { formatDateLong, formatTime, isValidDateString, utcToZoned } from '@/lib/clinic/time'
import { INACTIVE_STATUSES, busyFor, providerWindowsOn, slotIssues, type SlotIssue } from '@/lib/appointments/availability'
import { appointmentLinkToken, applyPlan, hashLinkToken, type PlanEvent } from '@/lib/appointments/notifications'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Actor =
  | { kind: 'STAFF'; userId: string; role: Role }
  | { kind: 'VOICE_AGENT'; callId: string | null }
  | { kind: 'PATIENT' }
  | { kind: 'IMPORT' }
  | { kind: 'SYSTEM' }

export type Issue = { reason: SlotIssue; detail?: string }

export type BookingFailure = {
  ok: false
  /** forbidden | not_found | invalid | slot (hard rule) | needs_confirmation (staff warnings) */
  code: 'forbidden' | 'not_found' | 'invalid' | 'slot' | 'needs_confirmation'
  message: string
  reason?: SlotIssue
  issues?: Issue[]
}

export type AppointmentRow = Prisma.AppointmentGetPayload<object>
export type BookingSuccess = { ok: true; appointment: AppointmentRow; warnings: Issue[]; provider: Provider | null }
export type BookingResult = BookingSuccess | BookingFailure

type Opts = { settings?: ClinicSettings; now?: Date }

/** Statuses that occupy the agenda. */
export const ACTIVE_STATUSES: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED', 'COMPLETED']

const HARD_FOR_STAFF: SlotIssue[] = ['invalid_date', 'invalid_time', 'conflict']

export const ISSUE_TEXT: Record<SlotIssue, string> = {
  invalid_date: 'Invalid date',
  invalid_time: 'Invalid time',
  past: 'This time has already passed',
  too_soon: 'Less than the minimum notice',
  too_far: 'Beyond the booking horizon',
  holiday: 'The clinic is closed (holiday)',
  closed: 'The clinic is closed that day',
  outside_hours: 'Outside opening hours',
  lunch: 'During the lunch break',
  provider_off: 'The dentist is not working at this time',
  blocked: 'This time is blocked in the agenda',
  conflict: 'The dentist already has an appointment at this time',
}

/** Send "now" messages straight away instead of waiting for the next cron run. */
function kick(planned: number): void {
  if (planned <= 0) return
  void import('@/lib/appointments/dispatch').then((m) => m.kickDispatch()).catch(() => {})
}

function fail(code: BookingFailure['code'], message: string, extra: Partial<BookingFailure> = {}): BookingFailure {
  return { ok: false, code, message, ...extra }
}

function actorSource(actor: Actor): BookingSource {
  switch (actor.kind) {
    case 'VOICE_AGENT': return 'VOICE_AGENT'
    case 'PATIENT': return 'PATIENT_LINK'
    case 'IMPORT': return 'IMPORT'
    default: return 'STAFF'
  }
}

function canWrite(actor: Actor): boolean {
  return actor.kind !== 'STAFF' || actor.role !== 'VIEWER'
}

/** Serialises writes per clinic day (same key the voice agent always used). Locks in date order. */
async function withDayLocks<T>(dates: string[], fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const unique = [...new Set(dates)].sort()
  return prisma.$transaction(async (tx) => {
    for (const d of unique) {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`booking:${d}`}))`
    }
    return fn(tx)
  })
}

/** Splits slot issues into hard failures and warnings for this actor. */
function judge(issues: Issue[], actor: Actor, allowOverlap: boolean): { hard: Issue[]; warnings: Issue[] } {
  if (actor.kind === 'IMPORT') {
    return { hard: issues.filter((i) => i.reason === 'invalid_date' || i.reason === 'invalid_time'), warnings: [] }
  }
  if (actor.kind === 'STAFF') {
    const hard = issues.filter((i) => HARD_FOR_STAFF.includes(i.reason) && !(i.reason === 'conflict' && allowOverlap))
    return { hard, warnings: issues.filter((i) => !hard.includes(i)) }
  }
  return { hard: issues, warnings: [] }
}

function auditEntry(actor: Actor, action: 'CREATE' | 'UPDATE', entityId: string, changes: Record<string, unknown>) {
  const voice = actor.kind === 'VOICE_AGENT'
  return prisma.auditLog
    .create({
      data: {
        userId: actor.kind === 'STAFF' ? actor.userId : null,
        action,
        entity: 'appointment',
        entityId,
        changes: JSON.parse(JSON.stringify({ source: voice ? 'voice_agent' : actor.kind.toLowerCase(), ...(voice && { vapiCallId: actor.callId }), ...changes })),
        userAgent: voice ? 'Vapi-Tool' : null,
        timestamp: new Date(),
      },
    })
    .catch((err: Error) => console.error('[booking] audit failed:', err.message))
}

function eventRow(appointmentId: string, kind: string, actor: Actor, data: Record<string, unknown>): Prisma.AppointmentEventCreateManyInput {
  return {
    appointmentId,
    kind,
    actor: actor.kind,
    userId: actor.kind === 'STAFF' ? actor.userId : null,
    vapiCallId: actor.kind === 'VOICE_AGENT' ? actor.callId : null,
    data: JSON.parse(JSON.stringify(data)),
  }
}

/** Recount visits from the record itself (safe when a status is changed back). */
async function refreshVisitStats(tx: Prisma.TransactionClient, patientId: string): Promise<void> {
  const agg = await tx.appointment.aggregate({ where: { patientId, status: 'COMPLETED' }, _count: { _all: true }, _max: { startTime: true } })
  await tx.patient.update({ where: { id: patientId }, data: { totalVisits: agg._count._all, lastVisitAt: agg._max.startTime } })
}

const PATIENT_CONTACT = { phone: true, email: true, smsRemindersEnabled: true } as const

// ─── Provider choice ─────────────────────────────────────────────────────────

/**
 * Who the appointment is with. Explicit id wins; otherwise the patient's preferred dentist,
 * otherwise the only active dentist. For the voice agent, only AI-bookable people who do the type.
 */
export function candidateProviders(input: {
  providerId?: string | null
  preferredProviderName?: string | null
  type: string
  actor: Actor
  settings: Pick<ClinicSettings, 'providers'>
}): Provider[] {
  const all = input.settings.providers
  if (input.providerId) {
    const p = providerById(input.providerId, all)
    return p ? [p] : []
  }
  const pool = activeProviders(input.settings).filter(
    (p) => providerDoesType(p, input.type) && (input.actor.kind !== 'VOICE_AGENT' && input.actor.kind !== 'PATIENT' ? true : p.agentBookable),
  )
  const preferred = providerByName(input.preferredProviderName, pool)
  return preferred ? [preferred, ...pool.filter((p) => p.id !== preferred.id)] : pool
}

// ─── Create ──────────────────────────────────────────────────────────────────

export type CreateInput = {
  patientId: string
  /** Clinic wall time. */
  date: string
  time: string
  type: AppointmentType
  durationMinutes?: number
  providerId?: string | null
  /** Ordered dentists to try when no `providerId` (the first free one is booked). */
  providerCandidates?: string[]
  reason?: string | null
  notes?: string | null
  status?: AppointmentStatus
  bookedVia?: BookingSource
  seriesId?: string | null
  externalId?: string | null
  allowOverlap?: boolean
  acknowledgeWarnings?: boolean
  /** Send the patient a confirmation (default true; never for imports). */
  notifyPatient?: boolean
}

export async function createAppointment(input: CreateInput, actor: Actor, opts: Opts = {}): Promise<BookingResult> {
  if (!canWrite(actor)) return fail('forbidden', 'Your role is read-only')
  const settings = opts.settings ?? (await getClinicSettings())
  const now = opts.now ?? new Date()
  if (!isValidDateString(input.date)) return fail('invalid', 'Invalid date', { reason: 'invalid_date' })

  const cfg = appointmentTypeConfig(input.type, settings.appointmentTypes)
  if (!cfg) return fail('invalid', 'Unknown appointment type')
  const duration = input.durationMinutes && input.durationMinutes > 0 ? Math.round(input.durationMinutes) : cfg.durationMinutes
  if (duration > 12 * 60) return fail('invalid', 'Duration is too long')

  const patient = await prisma.patient.findUnique({
    where: { id: input.patientId },
    select: { id: true, firstName: true, lastName: true, preferredProvider: true, status: true, ...PATIENT_CONTACT },
  })
  if (!patient) return fail('not_found', 'Patient not found')

  const candidates = input.providerCandidates && !input.providerId
    ? input.providerCandidates.map((id) => providerById(id, settings.providers)).filter((p): p is Provider => p !== null)
    : candidateProviders({ providerId: input.providerId, preferredProviderName: patient.preferredProvider, type: input.type, actor, settings })
  if (input.providerId && candidates.length === 0) return fail('invalid', 'Unknown dentist')
  const allowOverlap = actor.kind === 'STAFF' && input.allowOverlap === true
  let planned = 0

  const result = await withDayLocks([input.date], async (tx) => {
    let lastFailure: BookingFailure | null = null
    // No dentists configured at all: book clinic-wide (legacy behaviour). Dentists exist but none
    // fits (wrong type, not AI-bookable): refuse rather than book with nobody.
    // An import records what the old system said: no dentist there means no dentist here.
    const tries: (Provider | null)[] =
      actor.kind === 'IMPORT' && !input.providerId ? [null]
      : candidates.length > 0 ? candidates
      : activeProviders(settings).length === 0 ? [null] : []
    if (tries.length === 0) return { failure: fail('slot', 'No available dentist does this appointment type', { reason: 'provider_off' as SlotIssue }) }
    for (const provider of tries) {
      const busy = await busyFor(tx, input.date, settings, { providerId: provider?.id ?? null })
      const r = slotIssues({
        date: input.date,
        time: input.time,
        durationMinutes: duration,
        bufferMinutes: cfg.bufferMinutes,
        rules: settings,
        booked: busy.booked,
        blocks: busy.blocks,
        providerWindows: providerWindowsOn(input.date, provider),
        now,
        enforceNotice: actor.kind === 'VOICE_AGENT' || actor.kind === 'PATIENT',
      })
      const { hard, warnings } = judge(r.issues, actor, allowOverlap)
      if (hard.length > 0) {
        // Report the first (preferred) dentist's reason — the most useful one to relay.
        lastFailure = lastFailure ?? fail('slot', ISSUE_TEXT[hard[0].reason], { reason: hard[0].reason, issues: hard })
        continue
      }
      if (warnings.length > 0 && actor.kind === 'STAFF' && !input.acknowledgeWarnings) {
        return { failure: fail('needs_confirmation', warnings.map((w) => ISSUE_TEXT[w.reason]).join('; '), { issues: warnings }) }
      }

      const created = await tx.appointment.create({
        data: {
          patientId: patient.id,
          startTime: r.startUtc!,
          endTime: r.endUtc!,
          duration,
          type: input.type,
          status: input.status ?? 'SCHEDULED',
          provider: provider?.name ?? null,
          providerId: provider?.id ?? null,
          reason: input.reason ?? cfg.label,
          notes: input.notes ?? null,
          bookedVia: input.bookedVia ?? actorSource(actor),
          seriesId: input.seriesId ?? null,
          externalId: input.externalId ?? null,
          allowedOverlap: warnings.some((w) => w.reason === 'conflict'),
          createdById: actor.kind === 'STAFF' ? actor.userId : null,
        },
      })
      // The link token is derived from the id, so it can only be stored once the id exists.
      const appointment = await tx.appointment.update({
        where: { id: created.id },
        data: { publicTokenHash: hashLinkToken(appointmentLinkToken(created.id)) },
      })
      await tx.appointmentEvent.create({
        data: eventRow(appointment.id, 'CREATED', actor, {
          startTime: appointment.startTime, providerId: appointment.providerId, type: appointment.type, warnings: warnings.map((w) => w.reason),
        }),
      })
      if (appointment.status === 'COMPLETED') await refreshVisitStats(tx, patient.id)
      const event: PlanEvent = actor.kind === 'IMPORT' ? { type: 'replan' } : { type: 'created', notifyPatient: input.notifyPatient !== false }
      if (ACTIVE_STATUSES.includes(appointment.status) && appointment.status !== 'COMPLETED') {
        planned = await applyPlan(tx, appointment, patient, event, settings, now)
      }
      return { appointment, provider, warnings }
    }
    return { failure: lastFailure ?? fail('slot', ISSUE_TEXT.conflict, { reason: 'conflict' }) }
  })

  if ('failure' in result) return result.failure!
  const { appointment, provider, warnings } = result
  kick(planned)
  if (actor.kind !== 'IMPORT') {
    await auditEntry(actor, 'CREATE', appointment.id, { type: appointment.type, startTime: appointment.startTime.toISOString(), providerId: appointment.providerId, warnings: warnings.map((w) => w.reason) })
  }
  return { ok: true, appointment, warnings, provider }
}

// ─── Reschedule / edit ───────────────────────────────────────────────────────

export type RescheduleInput = {
  date: string
  time: string
  durationMinutes?: number
  providerId?: string | null
  type?: AppointmentType
  allowOverlap?: boolean
  acknowledgeWarnings?: boolean
  notifyPatient?: boolean
}

/** Move an appointment (same id, same patient link) and rebuild its reminders. */
export async function rescheduleAppointment(id: string, input: RescheduleInput, actor: Actor, opts: Opts = {}): Promise<BookingResult> {
  if (!canWrite(actor)) return fail('forbidden', 'Your role is read-only')
  const settings = opts.settings ?? (await getClinicSettings())
  const now = opts.now ?? new Date()
  if (!isValidDateString(input.date)) return fail('invalid', 'Invalid date', { reason: 'invalid_date' })

  const before = await prisma.appointment.findUnique({ where: { id }, include: { patient: { select: PATIENT_CONTACT } } })
  if (!before) return fail('not_found', 'Appointment not found')
  if (actor.kind !== 'STAFF' && (INACTIVE_STATUSES as readonly string[]).includes(before.status)) return fail('invalid', 'This appointment is no longer active')

  const type = input.type ?? before.type
  const cfg = appointmentTypeConfig(type, settings.appointmentTypes)
  const duration = input.durationMinutes && input.durationMinutes > 0 ? Math.round(input.durationMinutes) : before.duration
  const providerId = input.providerId !== undefined ? input.providerId : before.providerId ?? providerByName(before.provider, settings.providers)?.id ?? null
  const provider = providerById(providerId, settings.providers)
  if (input.providerId && !provider) return fail('invalid', 'Unknown dentist')
  if (provider && (actor.kind === 'VOICE_AGENT' || actor.kind === 'PATIENT') && !provider.agentBookable) {
    return fail('slot', ISSUE_TEXT.provider_off, { reason: 'provider_off' })
  }
  const oldDate = utcToZoned(before.startTime, settings.timezone).date
  const allowOverlap = actor.kind === 'STAFF' && input.allowOverlap === true
  let planned = 0

  const result = await withDayLocks([oldDate, input.date], async (tx) => {
    const busy = await busyFor(tx, input.date, settings, { providerId: provider?.id ?? null, excludeAppointmentId: id })
    const r = slotIssues({
      date: input.date,
      time: input.time,
      durationMinutes: duration,
      bufferMinutes: cfg?.bufferMinutes ?? 0,
      rules: settings,
      booked: busy.booked,
      blocks: busy.blocks,
      providerWindows: providerWindowsOn(input.date, provider),
      now,
      enforceNotice: actor.kind === 'VOICE_AGENT' || actor.kind === 'PATIENT',
    })
    const { hard, warnings } = judge(r.issues, actor, allowOverlap)
    if (hard.length > 0) return { failure: fail('slot', ISSUE_TEXT[hard[0].reason], { reason: hard[0].reason, issues: hard }) }
    if (warnings.length > 0 && actor.kind === 'STAFF' && !input.acknowledgeWarnings) {
      return { failure: fail('needs_confirmation', warnings.map((w) => ISSUE_TEXT[w.reason]).join('; '), { issues: warnings }) }
    }
    const moved = before.startTime.getTime() !== r.startUtc!.getTime()
    const reactivate = (INACTIVE_STATUSES as readonly string[]).includes(before.status)
    const appointment = await tx.appointment.update({
      where: { id },
      data: {
        startTime: r.startUtc!,
        endTime: r.endUtc!,
        duration,
        type,
        provider: provider?.name ?? before.provider,
        providerId: provider?.id ?? null,
        allowedOverlap: warnings.some((w) => w.reason === 'conflict'),
        // A moved appointment must be confirmed again.
        ...((moved || reactivate) && { status: 'SCHEDULED', confirmedAt: null, confirmedVia: null, remindersSent: 0, cancelledAt: null, cancelReason: null }),
      },
    })
    await tx.appointmentEvent.create({
      data: eventRow(id, moved ? 'RESCHEDULED' : 'UPDATED', actor, {
        from: before.startTime, to: appointment.startTime, fromProviderId: before.providerId, toProviderId: appointment.providerId,
        fromDuration: before.duration, toDuration: duration, warnings: warnings.map((w) => w.reason),
      }),
    })
    if (moved || reactivate) {
      planned = await applyPlan(tx, appointment, before.patient, { type: 'rescheduled', notifyPatient: input.notifyPatient !== false }, settings, now)
    }
    if (before.status === 'COMPLETED' && appointment.status !== 'COMPLETED') await refreshVisitStats(tx, before.patientId)
    return { appointment, warnings, moved }
  })
  if ('failure' in result) return result.failure!
  kick(planned)

  await auditEntry(actor, 'UPDATE', id, {
    action: result.moved ? 'rescheduled' : 'updated',
    before: before.startTime.toISOString(),
    after: result.appointment.startTime.toISOString(),
    providerId: result.appointment.providerId,
  })
  return { ok: true, appointment: result.appointment, warnings: result.warnings, provider }
}

/** Fields that never affect the agenda slot. */
export async function updateAppointmentDetails(
  id: string,
  patch: { reason?: string | null; notes?: string | null },
  actor: Actor,
): Promise<BookingResult> {
  if (!canWrite(actor)) return fail('forbidden', 'Your role is read-only')
  const before = await prisma.appointment.findUnique({ where: { id } })
  if (!before) return fail('not_found', 'Appointment not found')
  const data: Prisma.AppointmentUpdateInput = {}
  if (patch.reason !== undefined) data.reason = patch.reason
  if (patch.notes !== undefined) data.notes = patch.notes
  const appointment = await prisma.appointment.update({ where: { id }, data })
  await prisma.appointmentEvent.create({ data: eventRow(id, 'UPDATED', actor, { fields: Object.keys(data) }) })
  await auditEntry(actor, 'UPDATE', id, { action: 'updated', fields: Object.keys(data) })
  return { ok: true, appointment, warnings: [], provider: null }
}

// ─── Status ──────────────────────────────────────────────────────────────────

export type StatusInput = {
  status: AppointmentStatus
  reason?: string | null
  /** e.g. 'link', 'phone', 'sms' for confirmations. */
  via?: string | null
  notifyPatient?: boolean
  acknowledgeWarnings?: boolean
  allowOverlap?: boolean
}

export type StatusSuccess = BookingSuccess & { lateNotice: boolean; changed: boolean }

export async function setAppointmentStatus(id: string, input: StatusInput, actor: Actor, opts: Opts = {}): Promise<StatusSuccess | BookingFailure> {
  if (!canWrite(actor)) return fail('forbidden', 'Your role is read-only')
  const settings = opts.settings ?? (await getClinicSettings())
  const now = opts.now ?? new Date()
  const before = await prisma.appointment.findUnique({ where: { id }, include: { patient: { select: PATIENT_CONTACT } } })
  if (!before) return fail('not_found', 'Appointment not found')

  const inactiveBefore = (INACTIVE_STATUSES as readonly string[]).includes(before.status)
  const inactiveAfter = (INACTIVE_STATUSES as readonly string[]).includes(input.status)
  if (actor.kind !== 'STAFF' && inactiveBefore) return fail('invalid', 'This appointment is no longer active')

  // Bringing a cancelled appointment back must find its slot free again.
  if (inactiveBefore && !inactiveAfter) {
    const z = utcToZoned(before.startTime, settings.timezone)
    const r = await rescheduleAppointment(id, { date: z.date, time: z.time, acknowledgeWarnings: input.acknowledgeWarnings, allowOverlap: input.allowOverlap, notifyPatient: input.notifyPatient }, actor, { settings, now })
    if (!r.ok) return r
    if (input.status === 'SCHEDULED') return { ...r, lateNotice: false, changed: true }
  }
  if (before.status === input.status) {
    return { ok: true, appointment: before, warnings: [], provider: null, lateNotice: false, changed: false }
  }

  const hoursBefore = (before.startTime.getTime() - now.getTime()) / 3_600_000
  const lateNotice = input.status === 'CANCELLED' && hoursBefore >= 0 && hoursBefore < settings.bookingPolicy.cancellationNoticeHours
  const date = utcToZoned(before.startTime, settings.timezone).date
  let planned = 0

  const appointment = await withDayLocks([date], async (tx) => {
    const data: Prisma.AppointmentUpdateInput = { status: input.status }
    if (input.status === 'CONFIRMED') {
      data.confirmedAt = now
      data.confirmedVia = input.via ?? (actor.kind === 'STAFF' ? 'staff' : actor.kind.toLowerCase())
    }
    if (input.status === 'CANCELLED') {
      const reason = input.reason?.trim() || (actor.kind === 'PATIENT' ? 'Desmarcada pelo paciente' : 'Appointment cancelled')
      data.cancelledAt = now
      data.cancelReason = lateNotice && actor.kind !== 'STAFF' ? `[Aviso tardio] ${reason}` : reason
    }
    if (input.status === 'COMPLETED' && !before.checkedInAt) data.checkedInAt = before.startTime < now ? before.startTime : now
    const updated = await tx.appointment.update({ where: { id }, data })
    await tx.appointmentEvent.create({
      data: eventRow(id, input.status === 'NO_SHOW' ? 'NO_SHOW' : input.status, actor, { from: before.status, reason: input.reason ?? null, lateNotice, via: input.via ?? null }),
    })
    if (input.status === 'CANCELLED' || input.status === 'NO_SHOW' || input.status === 'COMPLETED') {
      const notify = input.status === 'CANCELLED' && input.notifyPatient !== false && actor.kind !== 'PATIENT'
      planned = await applyPlan(tx, updated, before.patient, { type: 'cancelled', notifyPatient: notify }, settings, now)
    }
    if (input.status === 'COMPLETED' || before.status === 'COMPLETED') await refreshVisitStats(tx, before.patientId)
    return updated
  })
  kick(planned)

  await auditEntry(actor, 'UPDATE', id, {
    action: input.status === 'CANCELLED' ? 'cancelled' : `status_${input.status.toLowerCase()}`,
    before: before.status,
    after: input.status,
    ...(input.status === 'CANCELLED' && { lateNotice }),
  })
  return { ok: true, appointment, warnings: [], provider: null, lateNotice, changed: true }
}

/** "Chegou" — the patient is in the waiting room (or undo). */
export async function setCheckedIn(id: string, arrived: boolean, actor: Actor, opts: Opts = {}): Promise<BookingResult> {
  if (!canWrite(actor)) return fail('forbidden', 'Your role is read-only')
  const now = opts.now ?? new Date()
  const before = await prisma.appointment.findUnique({ where: { id } })
  if (!before) return fail('not_found', 'Appointment not found')
  const appointment = await prisma.appointment.update({ where: { id }, data: { checkedInAt: arrived ? now : null } })
  await prisma.appointmentEvent.create({ data: eventRow(id, arrived ? 'CHECKED_IN' : 'CHECK_IN_UNDONE', actor, {}) })
  await auditEntry(actor, 'UPDATE', id, { action: arrived ? 'checked_in' : 'check_in_undone' })
  return { ok: true, appointment, warnings: [], provider: null }
}

// ─── Series ──────────────────────────────────────────────────────────────────

export type SeriesResult = { seriesId: string; created: AppointmentRow[]; skipped: { date: string; message: string }[] }

/** Repeat every `everyWeeks` weeks, `count` times in total (including the first). Clashing dates are skipped and reported. */
export async function createSeries(
  input: CreateInput,
  recurrence: { everyWeeks: number; count: number },
  actor: Actor,
  opts: Opts = {},
): Promise<SeriesResult | BookingFailure> {
  if (!canWrite(actor)) return fail('forbidden', 'Your role is read-only')
  const every = Math.max(1, Math.min(52, Math.round(recurrence.everyWeeks)))
  const count = Math.max(1, Math.min(52, Math.round(recurrence.count)))
  const settings = opts.settings ?? (await getClinicSettings())
  const seriesId = `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const created: AppointmentRow[] = []
  const skipped: { date: string; message: string }[] = []
  const [y, m, d] = input.date.split('-').map(Number)
  for (let i = 0; i < count; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i * every * 7))
    const date = dt.toISOString().slice(0, 10)
    const r = await createAppointment({ ...input, date, seriesId, notifyPatient: i === 0 ? input.notifyPatient : false }, actor, { ...opts, settings })
    if (r.ok) created.push(r.appointment)
    else skipped.push({ date, message: r.message })
  }
  return { seriesId, created, skipped }
}

// ─── Wording shared by staff alerts ──────────────────────────────────────────

export function appointmentWhen(start: Date, settings: Pick<ClinicSettings, 'timezone' | 'locale'>): string {
  return `${formatDateLong(start, settings.timezone, settings.locale)} às ${formatTime(start, settings.timezone, settings.locale)}`
}
