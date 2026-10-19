/**
 * Sends due appointment messages from the outbox (appointment_notifications).
 *
 * Called by /api/cron/dispatch (cron-job.org every 10 min in clinic hours + a daily Vercel
 * Cron) and kicked right after a booking so confirmations go out within seconds.
 * Safe to run twice at once: rows are claimed with FOR UPDATE SKIP LOCKED and each row is
 * sent at most once (its dedupe key is unique per slot).
 */
import prisma from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'
import { type ClinicSettings, type NotificationKind, getClinicSettings } from '@/lib/clinic/settings'
import { toE164 } from '@/lib/clinic/phone'
import { sendSMS } from '@/lib/messaging/smsProvider'
import { isPatientOptedOutByAnyRoute } from '@/lib/messaging/optOut'
import { sendEmail } from '@/lib/email/send'
import { appointmentLink, appointmentLinkToken, hashLinkToken, intoSendingWindow, publicBaseUrl } from '@/lib/appointments/notifications'
import { renderEmail, renderSms, type MessageContext } from '@/lib/appointments/messages'

const BATCH = 50
const STALE_LOCK_MS = 10 * 60_000
const RETRY_DELAYS_MIN = [5, 15, 60]
const MAX_ATTEMPTS = 3
const REMINDER_KINDS = new Set<NotificationKind>(['CONFIRMATION', 'REMINDER_DAY_BEFORE', 'REMINDER_HOURS_BEFORE', 'RESCHEDULED'])

export type DispatchResult = { claimed: number; sent: number; failed: number; retried: number; skipped: number; deferred: number }

export type Senders = {
  sms: (to: string, body: string, statusCallback: string | undefined) => Promise<{ ok: boolean; id?: string; error?: string }>
  email: (to: string, subject: string, html: string, text: string) => Promise<{ ok: boolean; id?: string; error?: string }>
}

export const defaultSenders: Senders = {
  async sms(to, body, statusCallback) {
    const r = await sendSMS({ to, body, statusCallback })
    return { ok: r.success, id: r.messageId, error: r.error }
  },
  async email(to, subject, html, text) {
    try {
      const r = await sendEmail(to, subject, html, text)
      return { ok: true, id: r.sgMessageId }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'email failed' }
    }
  },
}

/** The slot a message was planned for: `${id}:${kind}:${channel}:${ISO}` (the ISO itself contains ':'). */
export function startFromKey(dedupeKey: string): string {
  return dedupeKey.split(':').slice(3).join(':')
}

type Claimed = { id: string }

async function claim(now: Date, limit: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<Claimed[]>`
    UPDATE "appointment_notifications"
       SET "status" = 'SENDING', "locked_at" = ${now}, "attempts" = "attempts" + 1, "updated_at" = ${now}
     WHERE "id" IN (
       SELECT "id" FROM "appointment_notifications"
        WHERE "status" = 'PENDING' AND "send_at" <= ${now}
        ORDER BY "send_at"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
     )
    RETURNING "id"`
  return rows.map((r) => r.id)
}

export async function runDispatch(opts: { now?: Date; settings?: ClinicSettings; senders?: Senders; limit?: number } = {}): Promise<DispatchResult> {
  const now = opts.now ?? new Date()
  const settings = opts.settings ?? (await getClinicSettings())
  const senders = opts.senders ?? defaultSenders
  const result: DispatchResult = { claimed: 0, sent: 0, failed: 0, retried: 0, skipped: 0, deferred: 0 }

  // A run that died mid-send leaves rows in SENDING; give them back.
  await prisma.appointmentNotification.updateMany({
    where: { status: 'SENDING', lockedAt: { lt: new Date(now.getTime() - STALE_LOCK_MS) } },
    data: { status: 'PENDING', lockedAt: null },
  })

  const ids = await claim(now, opts.limit ?? BATCH)
  result.claimed = ids.length
  if (ids.length === 0) {
    await heartbeat(now)
    return result
  }

  const rows = await prisma.appointmentNotification.findMany({
    where: { id: { in: ids } },
    include: {
      appointment: { select: { id: true, startTime: true, endTime: true, status: true, provider: true } },
      patient: { select: { id: true, firstName: true, phone: true, email: true, smsRemindersEnabled: true, emailRemindersEnabled: true } },
    },
  })

  const statusCallback = `${publicBaseUrl()}/api/webhooks/twilio/status`
  const callbackUsable = /^https:\/\//.test(statusCallback)

  for (const row of rows) {
    const kind = row.kind as NotificationKind
    // Only touch the row while it is still ours: if it was cancelled meanwhile (moved
    // appointment, reminders switched off) a failure must not bring it back.
    const release = (data: Prisma.AppointmentNotificationUpdateManyMutationInput) =>
      prisma.appointmentNotification.updateMany({ where: { id: row.id, status: 'SENDING' }, data })
    const skip = async (why: string) => {
      result.skipped++
      await release({ status: 'SKIPPED', error: why, lockedAt: null })
    }

    if (!settings.flags.reminders) { await skip('reminders are switched off'); continue }
    const appt = row.appointment
    if (startFromKey(row.dedupeKey) !== appt.startTime.toISOString()) { await skip('appointment was moved'); continue }
    if (kind === 'CANCELLED' ? appt.status !== 'CANCELLED' : !['SCHEDULED', 'CONFIRMED'].includes(appt.status)) {
      await skip(`appointment is ${appt.status.toLowerCase()}`)
      continue
    }
    if (REMINDER_KINDS.has(kind) && appt.startTime.getTime() - now.getTime() < 30 * 60_000) { await skip('too close to the appointment'); continue }

    // A late cron run must still respect quiet hours.
    const allowed = intoSendingWindow(now, settings.reminderPolicy.quietHours, settings.timezone)
    if (allowed.getTime() > now.getTime()) {
      if (REMINDER_KINDS.has(kind) && appt.startTime.getTime() - allowed.getTime() < 30 * 60_000) { await skip('quiet hours until too late'); continue }
      result.deferred++
      await release({ status: 'PENDING', sendAt: allowed, lockedAt: null, attempts: { decrement: 1 } })
      continue
    }

    // Appointments created before patient links existed: store the hash so the link resolves.
    await prisma.appointment.updateMany({ where: { id: appt.id, publicTokenHash: null }, data: { publicTokenHash: hashLinkToken(appointmentLinkToken(appt.id)) } })

    const ctx: MessageContext = {
      appointmentId: appt.id,
      startTime: appt.startTime,
      endTime: appt.endTime,
      patientFirstName: row.patient.firstName,
      providerName: appt.provider,
      link: appointmentLink(appt.id),
      icsLink: `${publicBaseUrl()}/c/${appointmentLinkToken(appt.id)}/ics`,
      settings,
    }

    let outcome: { ok: boolean; id?: string; error?: string }
    if (row.channel === 'SMS') {
      const to = toE164(row.patient.phone)
      if (!to || !row.patient.smsRemindersEnabled) { await skip('no SMS number / SMS reminders off'); continue }
      if (await isPatientOptedOutByAnyRoute(row.patient.id, [to])) { await skip('patient opted out of SMS'); continue }
      outcome = await senders.sms(to, renderSms(kind, ctx), callbackUsable ? statusCallback : undefined)
    } else {
      if (!row.patient.email || !row.patient.emailRemindersEnabled) { await skip('no email address / email reminders off'); continue }
      const m = renderEmail(kind, ctx)
      outcome = await senders.email(row.patient.email, m.subject, m.html, m.text)
    }

    if (outcome.ok) {
      result.sent++
      await prisma.appointmentNotification.update({
        where: { id: row.id },
        data: { status: 'SENT', sentAt: now, lockedAt: null, error: null, providerMessageId: outcome.id ?? null },
      })
      await prisma.appointmentEvent.create({
        data: { appointmentId: appt.id, kind: 'NOTIFICATION_SENT', actor: 'SYSTEM', data: { notificationId: row.id, kind, channel: row.channel } },
      })
      if (REMINDER_KINDS.has(kind) && kind !== 'RESCHEDULED') {
        await prisma.appointment.update({ where: { id: appt.id }, data: { remindersSent: { increment: 1 } } }).catch(() => {})
      }
    } else if (row.attempts < MAX_ATTEMPTS) {
      result.retried++
      const delay = RETRY_DELAYS_MIN[Math.min(row.attempts, RETRY_DELAYS_MIN.length) - 1] ?? 60
      await release({ status: 'PENDING', lockedAt: null, error: (outcome.error ?? 'send failed').slice(0, 300), sendAt: new Date(now.getTime() + delay * 60_000) })
    } else {
      result.failed++
      await release({ status: 'FAILED', lockedAt: null, error: (outcome.error ?? 'send failed').slice(0, 300) })
      await prisma.appointmentEvent.create({
        data: { appointmentId: appt.id, kind: 'NOTIFICATION_FAILED', actor: 'SYSTEM', data: { notificationId: row.id, kind, channel: row.channel, error: (outcome.error ?? '').slice(0, 200) } },
      })
    }
  }

  await heartbeat(now)
  return result
}

async function heartbeat(now: Date): Promise<void> {
  await prisma.settings.updateMany({ data: { dispatchHeartbeatAt: now } }).catch(() => {})
}

/**
 * Send "now" messages without waiting for the next cron run. Uses Next's `after()` inside a
 * request (the response isn't delayed); outside one (scripts, tests) it's a no-op — the cron
 * picks the rows up.
 */
export async function kickDispatch(): Promise<void> {
  try {
    const { after } = await import('next/server')
    after(async () => {
      await runDispatch().catch((err: Error) => console.error('[dispatch] kick failed:', err.message))
    })
  } catch {
    // not in a request scope
  }
}
