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

export const portalAuthBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('request_code'),
    phone: z.string().min(10).max(20),
    // Optional marketing/notification SMS consent. OTP codes are transactional
    // and sent regardless of this flag.
    smsConsent: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('verify_code'),
    sessionToken: z.string().min(1),
    code: z.string().length(6),
  }),
  z.object({
    action: z.literal('verify_dob'),
    sessionToken: z.string().min(1),
    dateOfBirth: z.string().min(8),
  }),
  z.object({
    action: z.literal('magic_link_exchange'),
    token: z.string().min(1),
    dateOfBirth: z.string().min(8),
  }),
])

export const portalSendMessageBody = z.object({
  content: z.string().min(1).max(5000),
  reason: messageReason.optional(),
})

export const PORTAL_REASONS = messageReason.options

export const REASON_LABELS: Record<(typeof PORTAL_REASONS)[number], string> = {
  SCHEDULING: 'Scheduling',
  REFILL: 'Refill request',
  QUESTION: 'General question',
  URGENT: 'Urgent',
  INSURANCE: 'Insurance',
  RECORDS: 'Medical records',
  OTHER: 'Other',
}
