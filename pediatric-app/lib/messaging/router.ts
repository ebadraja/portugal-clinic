import type { MessageReason } from '@/lib/generated/prisma/client'
import prisma from '@/lib/prisma'

/** Default reason → shared inbox name mapping (FR-1104, Settings.defaultRoutingRules). */
const DEFAULT_INBOX_BY_REASON: Record<MessageReason, string> = {
  SCHEDULING: 'Scheduling',
  REFILL: 'Refills',
  QUESTION: 'Clinical',
  URGENT: 'Clinical',
  INSURANCE: 'Billing',
  RECORDS: 'Billing',
  OTHER: 'Scheduling',
}

type RoutingRules = Partial<Record<MessageReason, string>>

/**
 * Resolve shared inbox id for a message reason using Settings.defaultRoutingRules
 * or built-in defaults. Returns null if no matching inbox exists yet.
 */
export async function resolveInboxForReason(
  reason: MessageReason | null | undefined,
): Promise<string | null> {
  if (!reason) return null

  const settings = await prisma.settings.findFirst({
    select: { defaultRoutingRules: true },
  })

  const customRules = (settings?.defaultRoutingRules ?? {}) as RoutingRules
  const inboxName = customRules[reason] ?? DEFAULT_INBOX_BY_REASON[reason]

  const inbox = await prisma.sharedInbox.findFirst({
    where: { name: { equals: inboxName, mode: 'insensitive' } },
    select: { id: true },
  })

  return inbox?.id ?? null
}
