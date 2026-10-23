/**
 * System status: every silent failure that would break the clinic's loop
 * (call → answer/book → record → follow up), as a plain-language check.
 */
import prisma from '@/lib/prisma'
import { buildClinicSettings } from '@/lib/clinic/settings'
import { getVoiceDeliveryStatus } from '@/lib/voice/webhookLog'
import { emailDeliveryConfigured } from '@/lib/auth/passwordEmails'

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'info'
export type StatusCheck = { id: string; area: string; label: string; status: CheckStatus; detail: string }

/** cron-job.org runs every 10 min in sending hours; the Vercel backstop once a day. */
const DISPATCH_STALE_MS = 26 * 3_600_000

type Env = Record<string, string | undefined>

/** Pure: the environment-only checks. */
export function envChecks(env: Env): StatusCheck[] {
  const checks: StatusCheck[] = []
  const secret = env.VAPI_WEBHOOK_SECRET?.trim()
  checks.push(
    secret
      ? { id: 'vapi_secret', area: 'Voice agent', label: 'Webhook secret', status: 'ok', detail: 'VAPI_WEBHOOK_SECRET is set; unsigned requests are refused.' }
      : { id: 'vapi_secret', area: 'Voice agent', label: 'Webhook secret', status: 'fail', detail: 'VAPI_WEBHOOK_SECRET is not set, so every Vapi delivery is refused (fail-closed). Set it on the server and the same value as the assistant’s server secret in Vapi.' },
  )
  const encKey = env.MESSAGING_ENCRYPTION_KEY || env.ENCRYPTION_SECRET
  checks.push(
    encKey && encKey !== 'default-secret-key' && encKey.length >= 16
      ? { id: 'encryption_key', area: 'Security', label: 'Encryption key', status: 'ok', detail: 'A private encryption key is configured for stored secrets and patient data.' }
      : { id: 'encryption_key', area: 'Security', label: 'Encryption key', status: 'fail', detail: 'MESSAGING_ENCRYPTION_KEY is missing or uses the built-in default, so encrypted data is only obfuscated. Set a long random value (changing it later makes existing encrypted values unreadable).' },
  )
  const authSecret = env.NEXTAUTH_SECRET ?? env.AUTH_SECRET
  checks.push(
    authSecret && authSecret.length >= 32
      ? { id: 'auth_secret', area: 'Security', label: 'Session signing secret', status: 'ok', detail: 'NEXTAUTH_SECRET is set.' }
      : { id: 'auth_secret', area: 'Security', label: 'Session signing secret', status: 'warn', detail: 'NEXTAUTH_SECRET is missing or shorter than 32 characters.' },
  )
  checks.push({
    id: 'twilio',
    area: 'Reminders',
    label: 'SMS (Twilio)',
    status: env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER ? 'ok' : 'info',
    detail: env.TWILIO_ACCOUNT_SID ? 'Twilio credentials are configured.' : 'Twilio is not configured — SMS reminders and STOP handling are off.',
  })
  return checks
}

/** Pure: Settings still describing the pediatric demo practice the code came from. */
export function seedLeftovers(row: { practiceEmail?: string | null; practiceAddress?: string | null; practicePhone?: string | null; greetingMessage?: string | null } | null): string[] {
  if (!row) return []
  const found: string[] = []
  if (row.practiceEmail && /kids0?18/i.test(row.practiceEmail)) found.push('practice email')
  if (row.practiceAddress && /austin|tx\s*\d{5}/i.test(row.practiceAddress)) found.push('practice address')
  if (row.practicePhone && /\(512\)/.test(row.practicePhone)) found.push('practice phone')
  if (row.greetingMessage && /kids 0-18|pediatric/i.test(row.greetingMessage)) found.push('greeting')
  return found
}

export async function getSystemStatus(env: Env = process.env, now = new Date()): Promise<{ checks: StatusCheck[]; generatedAt: string }> {
  const since7d = new Date(now.getTime() - 7 * 24 * 3_600_000)
  const [row, delivery, emailOk, openCallbacks, urgentCallbacks, adminsWithout2fa, failedMessages, overdueMessages] = await Promise.all([
    prisma.settings.findFirst(),
    getVoiceDeliveryStatus(now),
    emailDeliveryConfigured(),
    prisma.callbackRequest.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.callbackRequest.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, urgency: 'URGENT' } }),
    prisma.user.count({ where: { role: 'ADMIN', isActive: true, approvalStatus: 'APPROVED', twoFactorEnabled: false } }),
    prisma.appointmentNotification.count({ where: { updatedAt: { gte: since7d }, OR: [{ status: 'FAILED' }, { deliveryStatus: { in: ['failed', 'undelivered'] } }] } }),
    prisma.appointmentNotification.count({ where: { status: 'PENDING', sendAt: { lt: new Date(now.getTime() - 60 * 60_000) } } }),
  ])
  const settings = buildClinicSettings(row)
  const checks = envChecks(env)

  // Two-factor for administrators
  checks.push(
    adminsWithout2fa === 0
      ? { id: 'admin_2fa', area: 'Security', label: 'Two-factor for administrators', status: 'ok', detail: 'Every active administrator signs in with two-factor.' }
      : { id: 'admin_2fa', area: 'Security', label: 'Two-factor for administrators', status: 'warn', detail: `${adminsWithout2fa} administrator(s) sign in with a password only.${row?.twoFactorRequired ? ' They will be asked to set it up at their next page load.' : ' Turn on “Required” in Security & Audit.'}` },
  )

  // Voice deliveries
  if (!delivery.lastReportAt) {
    checks.push({ id: 'vapi_reports', area: 'Voice agent', label: 'Call reports', status: 'warn', detail: 'No end-of-call report has been received yet. Point the Vapi assistant’s server URL at this CRM (see the AI Voice Agent tab).' })
  } else {
    const ageH = (now.getTime() - new Date(delivery.lastReportAt).getTime()) / 3_600_000
    checks.push({ id: 'vapi_reports', area: 'Voice agent', label: 'Call reports', status: ageH > 72 ? 'warn' : 'ok', detail: `Last call report ${ageH < 1 ? 'less than an hour' : `${Math.round(ageH)} h`} ago. ${delivery.processed24h} deliveries processed in 24 h.` })
  }
  if (delivery.rejected24h > 0 || delivery.errors24h > 0) {
    checks.push({ id: 'vapi_problems', area: 'Voice agent', label: 'Refused / failed deliveries', status: 'fail', detail: `${delivery.rejected24h} refused and ${delivery.errors24h} failed in the last 24 h. See the AI Voice Agent tab for the causes.` })
  }
  checks.push(
    settings.voiceAgent.paused
      ? { id: 'voice_paused', area: 'Voice agent', label: 'Kill switch', status: 'warn', detail: 'Voice tools are PAUSED: the agent can only take callbacks and transfer.' }
      : { id: 'voice_paused', area: 'Voice agent', label: 'Kill switch', status: 'ok', detail: 'Voice tools are active.' },
  )

  // Appointment reminders (outbox + /api/cron/dispatch)
  if (!settings.flags.reminders) {
    checks.push({ id: 'reminders', area: 'Reminders', label: 'Patient reminders', status: 'info', detail: 'Reminders are switched off (Settings → Agenda). Turn them on at cutover from Zappy.' })
  } else {
    checks.push(
      env.CRON_SECRET?.trim()
        ? { id: 'cron_secret', area: 'Reminders', label: 'Dispatcher secret', status: 'ok', detail: 'CRON_SECRET is set; only the scheduler can trigger sending.' }
        : { id: 'cron_secret', area: 'Reminders', label: 'Dispatcher secret', status: 'fail', detail: 'CRON_SECRET is not set, so /api/cron/dispatch refuses every run and no reminders are sent. Set it on Vercel and in the cron-job.org job header.' },
    )
    const dhb = row?.dispatchHeartbeatAt
    if (!dhb || now.getTime() - dhb.getTime() > DISPATCH_STALE_MS) {
      checks.push({ id: 'dispatch', area: 'Reminders', label: 'Reminder dispatcher', status: 'fail', detail: dhb ? `The dispatcher last ran ${dhb.toISOString()}. Check the cron-job.org job (every 10 min, 08:00–21:00 Lisbon) and the Vercel Cron.` : 'The dispatcher has never run. Create the cron-job.org job calling /api/cron/dispatch (see docs/agenda).' })
    } else {
      checks.push({ id: 'dispatch', area: 'Reminders', label: 'Reminder dispatcher', status: overdueMessages > 0 ? 'warn' : 'ok', detail: overdueMessages > 0 ? `${overdueMessages} message(s) are more than an hour late — the frequent cron job may not be running.` : `Last run ${Math.round((now.getTime() - dhb.getTime()) / 60_000)} min ago.` })
    }
    checks.push({
      id: 'reminder_failures', area: 'Reminders', label: 'Failed messages (7 days)', status: failedMessages > 0 ? 'warn' : 'ok',
      detail: failedMessages > 0 ? `${failedMessages} SMS/email could not be delivered. Open the appointment to see why (wrong number, no credit…).` : 'No failed messages.',
    })
  }

  checks.push(
    emailOk
      ? { id: 'email', area: 'Email', label: 'Email delivery', status: 'ok', detail: 'An email provider is configured.' }
      : { id: 'email', area: 'Email', label: 'Email delivery', status: 'warn', detail: 'No email provider is configured. Invites and resets are shown as one-time links instead; alerts are not sent.' },
  )

  // Configuration
  const leftovers = seedLeftovers(row)
  if (leftovers.length > 0) {
    checks.push({ id: 'seed_leftovers', area: 'Configuration', label: 'Demo data in Settings', status: 'fail', detail: `Settings still contain the pediatric demo practice (${leftovers.join(', ')}). Review Practice Information and save.` })
  }
  if (!row?.businessHours) {
    checks.push({ id: 'hours_unsaved', area: 'Configuration', label: 'Opening hours', status: 'warn', detail: 'Opening hours have never been saved; the clinic defaults (Mon–Fri 09:30–18:00, lunch 12:30–14:00) are in use. Confirm them in Practice Information.' })
  }
  for (const w of settings.warnings) {
    checks.push({ id: `settings_${checks.length}`, area: 'Configuration', label: 'Settings value', status: 'warn', detail: w })
  }
  if (!settings.identity.ersNumber || !settings.identity.nif) {
    checks.push({ id: 'identity', area: 'Configuration', label: 'Legal identity', status: 'warn', detail: 'NIF and/or ERS registration number are empty. They are required in patient-facing footers in Portugal.' })
  }

  checks.push({
    id: 'callbacks',
    area: 'Follow-up',
    label: 'Open callbacks',
    status: urgentCallbacks > 0 ? 'fail' : openCallbacks > 0 ? 'warn' : 'ok',
    detail: `${openCallbacks} open callback request(s)${urgentCallbacks ? `, ${urgentCallbacks} urgent` : ''}.`,
  })

  return { checks, generatedAt: now.toISOString() }
}
