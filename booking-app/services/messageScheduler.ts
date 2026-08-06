/**
 * Message Scheduler Service
 * Runs every 15 minutes inside the worker process.
 * Evaluates MessagingAutomationRules and queues SMS reminders.
 *
 * HIPAA: SMS bodies contain no PHI — generic text + portal links only.
 * SMS only sent to portal-verified phone numbers (PatientPortalSession).
 */

import cron from 'node-cron'
import { startOfMinute } from 'date-fns'
import { prisma } from '@/lib/prisma'
import type { MessagingTriggerEvent } from '@/lib/generated/prisma/client'
import {
  buildTriggerKey,
  parseRuleConditions,
  wasEmailSentForTriggerKey,
  wasSmsAutomationSent,
  wasSmsSentForTriggerKey,
} from '@/lib/messaging/automationCoordination'
import { queueAutomationSms } from '@/lib/messaging/automationSms'
import { seedDefaultAutomationRules } from '@/lib/messaging/seedAutomationRules'
import {
  appendPracticeFormLinkMessage,
  getDefaultIntakeForm,
  loadPracticeFormsFromSettings,
} from '@/lib/messaging/practiceFormsServer'

const CRON_SCHEDULE = '*/15 * * * *'
const WINDOW_MINUTES = 15

type RuleWithTemplate = {
  id: string
  name: string
  triggerEvent: MessagingTriggerEvent
  delayMinutes: number
  channel: string
  conditions: unknown
  template: { id: string; body: string }
}

function windowBounds(now: Date) {
  const windowMs = (WINDOW_MINUTES / 2) * 60_000
  return {
    windowStart: new Date(now.getTime() - windowMs),
    windowEnd: new Date(now.getTime() + windowMs),
  }
}

function matchesAppointmentConditions(
  appointment: { type: string },
  conditions: ReturnType<typeof parseRuleConditions>,
): boolean {
  if (!conditions.appointmentTypes?.length) return true
  return conditions.appointmentTypes.includes(appointment.type)
}

async function shouldSkipForEmailCoordination(
  patientId: string,
  appointmentId: string,
  triggerEvent: MessagingTriggerEvent,
  delayMinutes: number,
  conditions: ReturnType<typeof parseRuleConditions>,
): Promise<boolean> {
  if (conditions.suppressEmailForSameTrigger === false) return false
  const triggerKey = buildTriggerKey(triggerEvent, delayMinutes)
  return wasEmailSentForTriggerKey(patientId, appointmentId, triggerKey)
}

async function processAppointmentReminderRule(rule: RuleWithTemplate, now: Date): Promise<number> {
  const { windowStart, windowEnd } = windowBounds(now)
  const delayMs = rule.delayMinutes * 60_000
  const targetStart = new Date(windowStart.getTime() + delayMs)
  const targetEnd = new Date(windowEnd.getTime() + delayMs)
  const conditions = parseRuleConditions(rule.conditions)

  const appointments = await prisma.appointment.findMany({
    where: {
      startTime: { gte: targetStart, lte: targetEnd },
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      patient: { status: 'ACTIVE' },
    },
    include: {
      patient: { select: { id: true } },
    },
  })

  let queued = 0
  for (const appt of appointments) {
    if (!matchesAppointmentConditions(appt, conditions)) continue

    if (await wasSmsAutomationSent(appt.patientId, rule.id, appt.id)) continue

    if (
      await shouldSkipForEmailCoordination(
        appt.patientId,
        appt.id,
        rule.triggerEvent,
        rule.delayMinutes,
        conditions,
      )
    ) {
      continue
    }

    const sent = await queueAutomationSms({
      patientId: appt.patientId,
      ruleId: rule.id,
      triggerEvent: rule.triggerEvent,
      delayMinutes: rule.delayMinutes,
      templateBody: rule.template.body,
      appointmentId: appt.id,
      entityId: appt.id,
    })
    if (sent) queued++
  }

  return queued
}

async function processNoShowRule(rule: RuleWithTemplate, now: Date): Promise<number> {
  const { windowStart, windowEnd } = windowBounds(now)
  const delayMs = rule.delayMinutes * 60_000
  const targetEndStart = new Date(windowStart.getTime() - delayMs)
  const targetEndEnd = new Date(windowEnd.getTime() - delayMs)

  const appointments = await prisma.appointment.findMany({
    where: {
      status: 'NO_SHOW',
      endTime: { gte: targetEndStart, lte: targetEndEnd },
      patient: { status: 'ACTIVE' },
    },
    include: {
      patient: { select: { id: true } },
    },
  })

  let queued = 0
  for (const appt of appointments) {
    if (await wasSmsAutomationSent(appt.patientId, rule.id, appt.id)) continue

    if (
      await shouldSkipForEmailCoordination(
        appt.patientId,
        appt.id,
        rule.triggerEvent,
        rule.delayMinutes,
        parseRuleConditions(rule.conditions),
      )
    ) {
      continue
    }

    const sent = await queueAutomationSms({
      patientId: appt.patientId,
      ruleId: rule.id,
      triggerEvent: rule.triggerEvent,
      delayMinutes: rule.delayMinutes,
      templateBody: rule.template.body,
      appointmentId: appt.id,
      entityId: appt.id,
    })
    if (sent) queued++
  }

  return queued
}

async function processNewPatientRule(rule: RuleWithTemplate, now: Date): Promise<number> {
  const { windowStart } = windowBounds(now)
  const cutoff = new Date(windowStart.getTime() - WINDOW_MINUTES * 60_000)

  const patients = await prisma.patient.findMany({
    where: {
      status: 'ACTIVE',
      createdAt: { gte: cutoff },
    },
    select: { id: true },
  })

  let queued = 0
  for (const patient of patients) {
    if (await wasSmsAutomationSent(patient.id, rule.id, patient.id)) continue

    const sent = await queueAutomationSms({
      patientId: patient.id,
      ruleId: rule.id,
      triggerEvent: rule.triggerEvent,
      delayMinutes: rule.delayMinutes,
      templateBody: rule.template.body,
      entityId: patient.id,
    })
    if (sent) queued++
  }

  return queued
}

async function processIntakeFormDueRule(rule: RuleWithTemplate, now: Date): Promise<number> {
  const { windowStart, windowEnd } = windowBounds(now)
  const delayMs = rule.delayMinutes * 60_000
  const targetStart = new Date(windowStart.getTime() + delayMs)
  const targetEnd = new Date(windowEnd.getTime() + delayMs)
  const conditions = parseRuleConditions(rule.conditions)

  const appointments = await prisma.appointment.findMany({
    where: {
      startTime: { gte: targetStart, lte: targetEnd },
      status: { notIn: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] },
      patient: { status: 'ACTIVE' },
    },
    include: {
      patient: { select: { id: true } },
    },
  })

  let queued = 0
  for (const appt of appointments) {
    if (!matchesAppointmentConditions(appt, conditions)) continue
    if (await wasSmsAutomationSent(appt.patientId, rule.id, appt.id)) continue

    if (
      await shouldSkipForEmailCoordination(
        appt.patientId,
        appt.id,
        rule.triggerEvent,
        rule.delayMinutes,
        conditions,
      )
    ) {
      continue
    }

    const sent = await queueAutomationSms({
      patientId: appt.patientId,
      ruleId: rule.id,
      triggerEvent: rule.triggerEvent,
      delayMinutes: rule.delayMinutes,
      templateBody: rule.template.body,
      appointmentId: appt.id,
      entityId: appt.id,
    })
    if (sent) {
      queued++
      const { forms, defaultIntakeFormId } = await loadPracticeFormsFromSettings()
      const intakeForm = getDefaultIntakeForm(forms, defaultIntakeFormId)
      if (intakeForm) {
        await appendPracticeFormLinkMessage({
          patientId: appt.patientId,
          form: intakeForm,
          automation: true,
          updatePreview: true,
        })
      }
    }
  }

  return queued
}

async function processRule(rule: RuleWithTemplate, now: Date): Promise<number> {
  switch (rule.triggerEvent) {
    case 'APPOINTMENT_REMINDER':
      return processAppointmentReminderRule(rule, now)
    case 'NO_SHOW':
      return processNoShowRule(rule, now)
    case 'NEW_PATIENT':
      return processNewPatientRule(rule, now)
    case 'INTAKE_FORM_DUE':
      return processIntakeFormDueRule(rule, now)
    default:
      return 0
  }
}

export async function runMessageSchedulerTick(): Promise<{ rules: number; queued: number }> {
  await seedDefaultAutomationRules()

  const now = startOfMinute(new Date())
  const rules = await prisma.messagingAutomationRule.findMany({
    where: { isActive: true, channel: { in: ['SMS', 'BOTH'] } },
    include: { template: { select: { id: true, body: true } } },
  })

  let queued = 0
  for (const rule of rules) {
    queued += await processRule(rule, now)
  }

  console.log(
    `[message-scheduler] tick rules=${rules.length} queued=${queued} at=${now.toISOString()}`,
  )

  return { rules: rules.length, queued }
}

export function startMessageScheduler(): void {
  if (!cron.validate(CRON_SCHEDULE)) {
    throw new Error(`Invalid cron schedule: ${CRON_SCHEDULE}`)
  }

  cron.schedule(CRON_SCHEDULE, async () => {
    try {
      await runMessageSchedulerTick()
    } catch (err) {
      console.error('[message-scheduler] tick failed:', (err as Error).message)
    }
  })

  console.log('[message-scheduler] started — schedule:', CRON_SCHEDULE)
}

/** Run one tick immediately (testing). */
export async function runMessageSchedulerOnce(): Promise<{ rules: number; queued: number }> {
  return runMessageSchedulerTick()
}

/** Exported for email scheduler cross-channel coordination. */
export { wasSmsSentForTriggerKey }
