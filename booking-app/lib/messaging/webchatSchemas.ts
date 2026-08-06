import { z } from 'zod'

const messageReason = z.enum([
  'SCHEDULING',
  'REFILL',
  'QUESTION',
  'URGENT',
  'INSURANCE',
  'RECORDS',
  'OTHER',
])

export const webchatInitBody = z.object({
  sessionId: z.string().uuid().optional(),
})

export const webchatMessageBody = z.object({
  sessionId: z.string().uuid().optional(),
  visitorName: z.string().min(1).max(120),
  phone: z.string().min(10).max(20),
  reason: messageReason,
  content: z.string().min(1).max(5000),
})

export const WEBCHAT_REASONS = messageReason.options

export const REASON_LABELS: Record<(typeof WEBCHAT_REASONS)[number], string> = {
  SCHEDULING: 'Scheduling',
  REFILL: 'Refill request',
  QUESTION: 'General question',
  URGENT: 'Urgent',
  INSURANCE: 'Insurance',
  RECORDS: 'Medical records',
  OTHER: 'Other',
}
