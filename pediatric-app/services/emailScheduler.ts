/**
 * Email Scheduler Service
 * Runs every 15 minutes inside the worker process.
 * Matches upcoming appointments against active EmailAutomationRules
 * and queues reminder emails for any that haven't been sent yet.
 *
 * Supported trigger events:
 *   X_DAYS_BEFORE  → triggerOffsetHours is negative  (e.g. -168 = 1 week before)
 *   X_DAYS_AFTER   → triggerOffsetHours is positive  (e.g. +24  = 24hr post-visit)
 *   APPOINTMENT_CREATED / APPOINTMENT_UPDATED / APPOINTMENT_CANCELLED / PATIENT_CREATED
 *     → handled in API route webhooks, not here
 *
 * Pre-configured reminder windows (match these in your EmailAutomationRule rows):
 *   -168h  → 1-week-before    (e.g. send Develo developmental link)
 *   -72h   → 3-days-before    (e.g. send NovoPsych pre-assessment link)
 *   -48h   → 48-hour reminder
 *   -24h   → 24-hour reminder
 *   -2h    → same-day 2-hour reminder
 *   +24h   → post-visit follow-up (24hr after)
 */

import cron from 'node-cron'
import { startOfMinute } from 'date-fns'
import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { queueTransactionalEmail } from './emailQueue'
import {
  emailOffsetToTriggerKey,
  wasSmsSentForTriggerKey,
} from '@/lib/messaging/automationCoordination'

// How often the scheduler runs (must match CRON_SCHEDULE window)
const CRON_SCHEDULE   = '*/15 * * * *'   // every 15 minutes
const WINDOW_MINUTES  = 15               // match window ± half this value

// ─── Variable builders ────────────────────────────────────────────────────────

/**
 * Build merge-tag variables for a patient + appointment.
 * Keys must match the {{variable}} names in your templates.
 */
function buildVariables(
  patient:     { firstName: string; lastName: string; parentName: string | null },
  appointment: {
    startTime:   Date
    type:        string
    provider:    string | null
    reason:      string | null
  },
): Record<string, string> {
  const apptDate = appointment.startTime.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const apptTime = appointment.startTime.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
  })

  const visitType = appointment.type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())

  return {
    patient_name:       `${patient.firstName} ${patient.lastName}`,
    patient_first_name: patient.firstName,
    parent_name:        patient.parentName ?? patient.firstName,
    appointment_date:   apptDate,
    appointment_time:   apptTime,
    appointment_type:   visitType,
    provider_name:      appointment.provider ?? 'Dr. Tamas',
    reason:             appointment.reason ?? '',
    practice_name:      'Kids 0-18 Integrated Pediatrics',
    practice_phone:     '(555) 123-4567',
    practice_address:   '123 Medical Plaza Drive, Suite 100',
  }
}

// ─── Appointment match condition checker ──────────────────────────────────────

function matchesConditions(
  appointment: { type: string; provider: string | null },
  patient:     { dateOfBirth: Date },
  conditions:  Record<string, unknown> | null,
): boolean {
  if (!conditions) return true

  if (conditions.visitType && appointment.type !== conditions.visitType) return false

  if (Array.isArray(conditions.ageRange)) {
    const ageYears = (Date.now() - patient.dateOfBirth.getTime()) / (365.25 * 24 * 3600 * 1000)
    const [min, max] = conditions.ageRange as [number, number]
    if (ageYears < min || ageYears > max) return false
  }

  if (conditions.provider && appointment.provider !== conditions.provider) return false

  return true
}

// ─── Core scheduler tick ──────────────────────────────────────────────────────

async function runSchedulerTick(): Promise<void> {
  const now       = startOfMinute(new Date())
  const windowMs  = (WINDOW_MINUTES / 2) * 60_000
  const windowStart = new Date(now.getTime() - windowMs)
  const windowEnd   = new Date(now.getTime() + windowMs)

  // Load all active time-based rules
  const rules = await prisma.emailAutomationRule.findMany({
    where:   { isActive: true, triggerEvent: { in: ['X_DAYS_BEFORE', 'X_DAYS_AFTER'] } },
    include: { template: { select: { id: true, isActive: true } } },
  })

  if (rules.length === 0) return

  for (const rule of rules) {
    if (!rule.template.isActive || rule.triggerOffsetHours == null) continue

    // The appointment time that would trigger this rule right now:
    // appointmentTime = now - offsetHours
    // So we query appointments where startTime is in: [now - offset - window, now - offset + window]
    const offsetMs          = rule.triggerOffsetHours * 3600_000
    const targetApptStart   = new Date(windowStart.getTime() - offsetMs)
    const targetApptEnd     = new Date(windowEnd.getTime()   - offsetMs)

    // Fetch matching appointments with patient + contact info
    const appointments = await prisma.appointment.findMany({
      where: {
        startTime: { gte: targetApptStart, lte: targetApptEnd },
        status:    { notIn: ['CANCELLED', 'NO_SHOW'] },
        patient: {
          status:       'ACTIVE',
          email:        { not: null },
          unsubscribe:  null,   // exclude unsubscribed patients
        },
      },
      include: {
        patient: {
          select: {
            id: true, firstName: true, lastName: true,
            parentName: true, parentEmail: true, email: true,
            dateOfBirth: true,
          },
        },
      },
    })

    for (const appt of appointments) {
      const patient = appt.patient

      // Determine recipient email (parent email preferred for pediatrics)
      const rawEmail = patient.parentEmail ?? patient.email
      if (!rawEmail) continue

      // Apply rule conditions (visit type, age range, provider)
      if (!matchesConditions(appt, patient, rule.conditions as Record<string, unknown> | null)) {
        continue
      }

      // Idempotency check: has this rule already fired for this appointment?
      const alreadySent = await prisma.emailLog.findFirst({
        where: {
          patientId:  patient.id,
          templateId: rule.templateId,
          // Use metadata to store the appointmentId + ruleId pair
          metadata:   { path: ['appointmentId'], equals: appt.id },
          status:     { in: ['QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED'] },
        },
      })
      if (alreadySent) continue

      const triggerKey = emailOffsetToTriggerKey(
        rule.triggerEvent as 'X_DAYS_BEFORE' | 'X_DAYS_AFTER',
        rule.triggerOffsetHours!,
      )
      if (await wasSmsSentForTriggerKey(patient.id, appt.id, triggerKey)) {
        continue
      }

      // Build merge variables
      const variables = buildVariables(patient, {
        startTime: appt.startTime,
        type:      appt.type,
        provider:  appt.provider,
        reason:    appt.reason,
      })

      // Encrypt email address before storing / queuing
      const encryptedEmail = encrypt(rawEmail)

      // Schedule the send: fire at the exact trigger moment, not "now"
      const sendAt = new Date(appt.startTime.getTime() + offsetMs)

      await queueTransactionalEmail(
        patient.id,
        rule.templateId,
        { ...variables, appointmentId: appt.id, ruleId: rule.id, triggerKey },
        encryptedEmail,
        sendAt,
      )

      console.log(
        `[email-scheduler] queued rule=${rule.id} patientId=${patient.id}` +
        ` apptId=${appt.id} sendAt=${sendAt.toISOString()}`
      )
    }
  }
}

// ─── Scheduled campaign sender ────────────────────────────────────────────────

async function runScheduledCampaigns(): Promise<void> {
  const now = new Date()

  const due = await prisma.emailCampaign.findMany({
    where: {
      status:      'SCHEDULED',
      scheduledAt: { lte: now },
    },
    include: {
      template: { select: { id: true, isActive: true } },
    },
  })

  for (const campaign of due) {
    if (!campaign.template.isActive) continue

    // Build recipient list from segment_filters
    const recipients = await buildCampaignRecipients(campaign)

    if (recipients.length === 0) {
      await prisma.emailCampaign.update({
        where: { id: campaign.id },
        data:  { status: 'SENT', sentAt: now, recipientCount: 0 },
      })
      continue
    }

    // Import inline to avoid circular dep at module load time
    const { queueCampaignBatch } = await import('./emailQueue')
    await queueCampaignBatch(campaign.id, recipients, campaign.templateId)

    await prisma.emailCampaign.update({
      where: { id: campaign.id },
      data:  { sentAt: now },
    })

    console.log(`[email-scheduler] campaign=${campaign.id} dispatched recipients=${recipients.length}`)
  }
}

async function buildCampaignRecipients(campaign: {
  id:             string
  segmentFilters: unknown
}): Promise<Array<{ patientId: string; toEmail: string; variables: Record<string, string> }>> {
  const filters = (campaign.segmentFilters ?? {}) as Record<string, unknown>

  const where: Record<string, unknown> = {
    status: 'ACTIVE',
    email:  { not: null },
    unsubscribe: null,
  }

  if (filters.provider) {
    where.appointments = {
      some: { provider: filters.provider, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
    }
  }

  if (Array.isArray(filters.ageRange)) {
    const [minYears, maxYears] = filters.ageRange as [number, number]
    const now = new Date()
    where.dateOfBirth = {
      gte: new Date(now.getFullYear() - maxYears, now.getMonth(), now.getDate()),
      lte: new Date(now.getFullYear() - minYears, now.getMonth(), now.getDate()),
    }
  }

  const patients = await prisma.patient.findMany({
    where: where as Prisma.PatientWhereInput,
    select: {
      id: true, firstName: true, lastName: true,
      parentName: true, email: true, parentEmail: true,
      dateOfBirth: true,
    },
  })

  return patients
    .filter(p => p.parentEmail ?? p.email)
    .map(p => ({
      patientId: p.id,
      toEmail:   encrypt(p.parentEmail ?? p.email!),
      variables: {
        patient_name:       `${p.firstName} ${p.lastName}`,
        patient_first_name: p.firstName,
        parent_name:        p.parentName ?? p.firstName,
        practice_name:      'Kids 0-18 Integrated Pediatrics',
      },
    }))
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/** Start the scheduler — call once from worker.ts. */
export function startEmailScheduler(): void {
  if (!cron.validate(CRON_SCHEDULE)) {
    throw new Error(`Invalid cron schedule: ${CRON_SCHEDULE}`)
  }

  cron.schedule(CRON_SCHEDULE, async () => {
    try {
      await Promise.all([
        runSchedulerTick(),
        runScheduledCampaigns(),
      ])
    } catch (err) {
      console.error('[email-scheduler] tick failed:', (err as Error).message)
    }
  })

  console.log('[email-scheduler] started — schedule:', CRON_SCHEDULE)
}

/** Run one tick immediately (useful for testing). */
export async function runSchedulerOnce(): Promise<void> {
  await Promise.all([runSchedulerTick(), runScheduledCampaigns()])
}
