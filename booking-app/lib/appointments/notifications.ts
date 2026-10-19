/**
 * Patient messages about an appointment — planning side of the outbox.
 *
 * The booking service calls `applyPlan` inside the booking transaction, so a moved or
 * cancelled appointment can never leave a reminder for the old slot behind. Sending is
 * done by lib/appointments/dispatch.ts (/api/cron/dispatch).
 *
 * Nothing is planned while Settings.remindersEnabled is off; switching it on calls
 * `replanUpcoming` once so existing future appointments get their reminders.
 */
import { createHash, createHmac } from 'node:crypto'
import type { Prisma } from '@/lib/generated/prisma/client'
import type { ClinicSettings, NotificationKind, ReminderPolicy } from '@/lib/clinic/settings'
import { addDays, toMinutes, utcToZoned, zonedTimeToUtc } from '@/lib/clinic/time'

export type Channel = 'SMS' | 'EMAIL'
export type PlannedMessage = { kind: NotificationKind; channel: Channel; sendAt: Date }

/** Why the plan is being (re)built. */
export type PlanEvent =
  | { type: 'created'; notifyPatient: boolean }
  | { type: 'rescheduled'; notifyPatient: boolean }
  | { type: 'cancelled'; notifyPatient: boolean }
  | { type: 'replan' } // reminders only — e.g. reminders switched on, or an import

const MIN = 60_000
const HOUR = 60 * MIN
/** A reminder this close to the start is pointless. */
const LAST_USEFUL_BEFORE_START = 30 * MIN
/** After a confirmation, don't send the day-before reminder within this time. */
const CONFIRMATION_COVERS = 12 * HOUR

/** Moves `at` into the allowed sending window (clinic time). */
export function intoSendingWindow(at: Date, quiet: ReminderPolicy['quietHours'], timeZone: string): Date {
  const z = utcToZoned(at, timeZone)
  const start = toMinutes(quiet.start)
  const end = toMinutes(quiet.end)
  if (z.minutes < start) return zonedTimeToUtc(z.date, quiet.start, timeZone)
  if (z.minutes >= end) return zonedTimeToUtc(addDays(z.date, 1), quiet.start, timeZone)
  return at
}

/**
 * Which messages to send, and when. Pure.
 * `channels` are the ones the patient can actually receive (phone / email on file).
 */
export function planMessages(input: {
  startTime: Date
  event: PlanEvent
  policy: ReminderPolicy
  timeZone: string
  now: Date
  channels: Channel[]
}): PlannedMessage[] {
  const { startTime, event, policy, timeZone, now } = input
  const can = (wanted: Channel[]) => wanted.filter((c) => input.channels.includes(c))
  const out: PlannedMessage[] = []
  const push = (kind: NotificationKind, channels: Channel[], at: Date, mustPrecedeStart: boolean) => {
    const sendAt = intoSendingWindow(at < now ? now : at, policy.quietHours, timeZone)
    if (mustPrecedeStart && sendAt.getTime() > startTime.getTime() - LAST_USEFUL_BEFORE_START) return
    for (const channel of can(channels)) out.push({ kind, channel, sendAt })
  }

  if (event.type === 'cancelled') {
    if (event.notifyPatient && policy.changeNotices.cancelled && startTime > now) push('CANCELLED', policy.changeNotices.channels, now, false)
    return out
  }
  if (startTime.getTime() <= now.getTime()) return out

  let immediateSent = false
  if (event.type === 'created' && event.notifyPatient && policy.confirmation.enabled) {
    push('CONFIRMATION', policy.confirmation.channels, now, true)
    immediateSent = out.length > 0
  }
  if (event.type === 'rescheduled' && event.notifyPatient && policy.changeNotices.rescheduled) {
    push('RESCHEDULED', policy.changeNotices.channels, now, true)
    immediateSent = out.length > 0
  }

  if (policy.dayBefore.enabled) {
    const day = utcToZoned(startTime, timeZone).date
    const at = zonedTimeToUtc(addDays(day, -1), policy.dayBefore.sendAt, timeZone)
    const tooLate = at.getTime() <= now.getTime()
    const coveredByImmediate = immediateSent && at.getTime() < now.getTime() + CONFIRMATION_COVERS
    if (!tooLate && !coveredByImmediate) push('REMINDER_DAY_BEFORE', policy.dayBefore.channels, at, true)
  }
  if (policy.hoursBefore.enabled) {
    const at = new Date(startTime.getTime() - policy.hoursBefore.hours * HOUR)
    if (at.getTime() > now.getTime() + 2 * HOUR) push('REMINDER_HOURS_BEFORE', policy.hoursBefore.channels, at, true)
  }
  return out
}

export function dedupeKey(appointmentId: string, kind: NotificationKind, channel: Channel, startTime: Date): string {
  return `${appointmentId}:${kind}:${channel}:${startTime.toISOString()}`
}

/**
 * Replace the pending messages of an appointment with a fresh plan. Runs inside the booking
 * transaction. No-op while reminders are switched off.
 */
export async function applyPlan(
  tx: Prisma.TransactionClient,
  appt: { id: string; patientId: string; startTime: Date },
  patient: { phone: string | null; email: string | null; smsRemindersEnabled: boolean },
  event: PlanEvent,
  settings: Pick<ClinicSettings, 'reminderPolicy' | 'timezone' | 'flags'>,
  now: Date,
): Promise<number> {
  if (!settings.flags.reminders) return 0
  if (event.type !== 'created') {
    await tx.appointmentNotification.updateMany({
      where: { appointmentId: appt.id, status: { in: ['PENDING', 'SENDING'] } },
      data: { status: 'CANCELLED' },
    })
  }
  const channels: Channel[] = []
  if (patient.phone && patient.smsRemindersEnabled) channels.push('SMS')
  if (patient.email) channels.push('EMAIL')
  const plan = planMessages({ startTime: appt.startTime, event, policy: settings.reminderPolicy, timeZone: settings.timezone, now, channels })
  if (plan.length === 0) return 0
  const res = await tx.appointmentNotification.createMany({
    data: plan.map((m) => ({
      appointmentId: appt.id,
      patientId: appt.patientId,
      kind: m.kind,
      channel: m.channel,
      sendAt: m.sendAt,
      dedupeKey: dedupeKey(appt.id, m.kind, m.channel, appt.startTime),
    })),
    skipDuplicates: true,
  })
  return res.count
}

// ─── Patient link token (/c/<token>) ─────────────────────────────────────────

function linkSecret(): string {
  return process.env.APPOINTMENT_LINK_SECRET || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'dev-only-appointment-link-secret'
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/**
 * Deterministic per appointment (HMAC), so every message carries the same link and the raw
 * token never needs storing — only its hash, for lookup. 12 base62 chars ≈ 71 bits.
 */
export function appointmentLinkToken(appointmentId: string): string {
  const mac = createHmac('sha256', linkSecret()).update(`appointment-link:${appointmentId}`).digest()
  let out = ''
  for (let i = 0; i < 12; i++) out += BASE62[mac[i] % 62]
  return out
}

export function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function publicBaseUrl(): string {
  return (process.env.PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

export function appointmentLink(appointmentId: string): string {
  return `${publicBaseUrl()}/c/${appointmentLinkToken(appointmentId)}`
}
