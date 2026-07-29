import prisma from '@/lib/prisma'
import { formatPhoneE164 } from '@/lib/messaging/smsProvider'
import { queueSms } from '@/services/messageQueue'
import { resolveMessagingMergeTags } from '@/lib/messaging/mergeTags'
import { appendSystemMessage } from '@/lib/messaging/systemMessages'
import type { MessagingTriggerEvent } from '@/lib/generated/prisma/client'
import type { Prisma } from '@/lib/generated/prisma/client'
import { buildTriggerKey } from '@/lib/messaging/automationCoordination'

export async function getVerifiedPortalPhone(patientId: string): Promise<string | null> {
  const session = await prisma.patientPortalSession.findFirst({
    where: {
      patientId,
      verifiedAt: { not: null },
      expiresAt: { gt: new Date() },
    },
    orderBy: { verifiedAt: 'desc' },
    select: { phoneNumber: true },
  })
  return session?.phoneNumber ?? null
}

export async function isPatientSmsOptedOut(patientId: string): Promise<boolean> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { smsOptOut: true },
  })
  if (patient?.smsOptOut) return true

  const optOut = await prisma.sMSOptOut.findFirst({
    where: { patientId, isOptedOut: true },
    select: { id: true },
  })
  return optOut !== null
}

const SYSTEM_EVENT_LABELS: Record<MessagingTriggerEvent, string> = {
  APPOINTMENT_REMINDER: 'Appointment reminder sent via SMS',
  APPOINTMENT_CONFIRMED: 'Appointment confirmation sent via SMS',
  APPOINTMENT_CANCELLED: 'Appointment cancellation notice sent via SMS',
  NO_SHOW: 'No-show follow-up sent via SMS',
  POST_VISIT: 'Post-visit follow-up sent via SMS',
  NEW_PATIENT: 'Welcome message sent via SMS',
  INTAKE_FORM_DUE: 'Intake form reminder sent via SMS',
  CUSTOM: 'Automated message sent via SMS',
}

export type QueueAutomationSmsInput = {
  patientId: string
  ruleId: string
  triggerEvent: MessagingTriggerEvent
  delayMinutes: number
  templateBody: string
  appointmentId?: string
  entityId: string
}

/**
 * Queue automated SMS + record system message for idempotency / staff visibility.
 */
export async function queueAutomationSms(input: QueueAutomationSmsInput): Promise<boolean> {
  const {
    patientId,
    ruleId,
    triggerEvent,
    delayMinutes,
    templateBody,
    appointmentId,
    entityId,
  } = input

  if (await isPatientSmsOptedOut(patientId)) {
    return false
  }

  const verifiedPhone = await getVerifiedPortalPhone(patientId)
  if (!verifiedPhone) {
    return false
  }

  let phoneE164: string
  try {
    phoneE164 = formatPhoneE164(verifiedPhone)
  } catch {
    console.error(`[message-scheduler] invalid verified phone patientId=${patientId}`)
    return false
  }

  const body = await resolveMessagingMergeTags(templateBody, {
    patientId,
    appointmentId,
  })

  const triggerKey = buildTriggerKey(triggerEvent, delayMinutes)

  await queueSms(
    {
      to: phoneE164,
      body,
      type: 'automation',
      patientId,
      automationRuleId: ruleId,
      appointmentId,
    },
    { jobId: `auto-${ruleId}-${entityId}` },
  )

  const metadata: Prisma.InputJsonValue = {
    automationRuleId: ruleId,
    triggerEvent,
    triggerKey,
    channel: 'SMS',
    ...(appointmentId ? { appointmentId } : {}),
    ...(triggerEvent === 'NEW_PATIENT' ? { patientId: entityId } : {}),
  }

  const label = SYSTEM_EVENT_LABELS[triggerEvent] ?? SYSTEM_EVENT_LABELS.CUSTOM
  await appendSystemMessage({
    patientId,
    content: `[Automated] ${label}`,
    contentType: 'SYSTEM_EVENT',
    metadata,
    updatePreview: false,
  })

  return true
}
