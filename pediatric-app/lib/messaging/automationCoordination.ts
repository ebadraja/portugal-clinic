import prisma from '@/lib/prisma'
import type { MessagingTriggerEvent } from '@/lib/generated/prisma/client'

export type AutomationRuleConditions = {
  suppressEmailForSameTrigger?: boolean
  suppressSmsForSameTrigger?: boolean
  appointmentTypes?: string[]
}

export function parseRuleConditions(raw: unknown): AutomationRuleConditions {
  if (!raw || typeof raw !== 'object') return {}
  return raw as AutomationRuleConditions
}

export function buildTriggerKey(triggerEvent: MessagingTriggerEvent, delayMinutes: number): string {
  return `${triggerEvent}:${delayMinutes}`
}

/** Map email scheduler offset hours to messaging trigger key for cross-channel dedup. */
export function emailOffsetToTriggerKey(
  triggerEvent: 'X_DAYS_BEFORE' | 'X_DAYS_AFTER',
  offsetHours: number,
): string {
  const delayMinutes = Math.abs(offsetHours) * 60
  if (triggerEvent === 'X_DAYS_BEFORE') {
    return buildTriggerKey('APPOINTMENT_REMINDER', delayMinutes)
  }
  return buildTriggerKey('POST_VISIT', delayMinutes)
}

export async function wasSmsAutomationSent(
  patientId: string,
  ruleId: string,
  entityId: string,
): Promise<boolean> {
  const conversation = await prisma.conversation.findUnique({
    where: { patientId },
    select: { id: true },
  })
  if (!conversation) return false

  const messages = await prisma.message.findMany({
    where: {
      conversationId: conversation.id,
      senderType: 'SYSTEM',
      channel: 'SYSTEM',
    },
    select: { metadata: true },
    take: 200,
    orderBy: { createdAt: 'desc' },
  })

  return messages.some((m) => {
    const meta = (m.metadata ?? {}) as Record<string, unknown>
    if (meta.automationRuleId !== ruleId) return false
    return meta.appointmentId === entityId || meta.patientId === entityId
  })
}

export async function wasEmailSentForTriggerKey(
  patientId: string,
  appointmentId: string,
  triggerKey: string,
): Promise<boolean> {
  const logs = await prisma.emailLog.findMany({
    where: {
      patientId,
      status: { in: ['QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED'] },
    },
    select: { metadata: true },
    take: 100,
    orderBy: { createdAt: 'desc' },
  })

  return logs.some((l) => {
    const meta = (l.metadata ?? {}) as Record<string, unknown>
    return meta.appointmentId === appointmentId && meta.triggerKey === triggerKey
  })
}

export async function wasSmsSentForTriggerKey(
  patientId: string,
  appointmentId: string,
  triggerKey: string,
): Promise<boolean> {
  const conversation = await prisma.conversation.findUnique({
    where: { patientId },
    select: { id: true },
  })
  if (!conversation) return false

  const messages = await prisma.message.findMany({
    where: {
      conversationId: conversation.id,
      senderType: 'SYSTEM',
      channel: 'SYSTEM',
    },
    select: { metadata: true },
    take: 200,
    orderBy: { createdAt: 'desc' },
  })

  return messages.some((m) => {
    const meta = (m.metadata ?? {}) as Record<string, unknown>
    return (
      meta.appointmentId === appointmentId &&
      meta.triggerKey === triggerKey &&
      meta.channel === 'SMS'
    )
  })
}
