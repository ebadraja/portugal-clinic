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

const conversationStatus = z.enum([
  'OPEN',
  'AWAITING_REPLY',
  'RESOLVED',
  'ARCHIVED',
])

const messageChannel = z.enum(['SMS', 'WEB_CHAT', 'PORTAL', 'SYSTEM'])

export const listConversationsQuery = z.object({
  inbox: z.enum(['all', 'unassigned', 'mine', 'shared']).default('all'),
  sharedInboxId: z.string().optional(),
  status: conversationStatus.optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const createConversationBody = z.object({
  patientId: z.string().min(1),
  reason: messageReason.optional(),
})

export const patchConversationBody = z.object({
  status: conversationStatus.optional(),
  markRead: z.boolean().optional(),
})

export const sendMessageBody = z.object({
  content: z.string().min(1).max(10000),
  channel: messageChannel.default('PORTAL'),
  templateId: z.string().optional(),
})

export const assignConversationBody = z.object({
  assignedToId: z.string().nullable().optional(),
  assignedInboxId: z.string().nullable().optional(),
  reason: z.string().max(500).optional(),
})

export const internalNoteBody = z.object({
  content: z.string().min(1).max(10000),
})

export const listMessagesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const createTemplateBody = z.object({
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(80),
  body: z.string().min(1).max(10000),
  channel: z.enum(['SMS', 'PORTAL', 'BOTH']).default('BOTH'),
})

export const updateTemplateBody = createTemplateBody.partial()

export const createSharedInboxBody = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
})

export const updateSharedInboxBody = createSharedInboxBody.partial()

const messagingTriggerEvent = z.enum([
  'APPOINTMENT_REMINDER',
  'APPOINTMENT_CONFIRMED',
  'APPOINTMENT_CANCELLED',
  'NO_SHOW',
  'POST_VISIT',
  'NEW_PATIENT',
  'INTAKE_FORM_DUE',
  'CUSTOM',
])

export const createAutomationRuleBody = z.object({
  name: z.string().min(1).max(120),
  triggerEvent: messagingTriggerEvent,
  delayMinutes: z.number().int().min(0).max(60 * 24 * 365),
  channel: z.enum(['SMS', 'BOTH']).default('SMS'),
  isActive: z.boolean().default(true),
  templateBody: z.string().min(1).max(10000),
  conditions: z.record(z.string(), z.unknown()).optional(),
})

export const updateAutomationRuleBody = z.object({
  name: z.string().min(1).max(120).optional(),
  triggerEvent: messagingTriggerEvent.optional(),
  delayMinutes: z.number().int().min(0).max(60 * 24 * 365).optional(),
  channel: z.enum(['SMS', 'BOTH']).optional(),
  isActive: z.boolean().optional(),
  templateBody: z.string().min(1).max(10000).optional(),
  conditions: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const AUTOMATION_TRIGGER_LABELS: Record<
  (typeof messagingTriggerEvent.options)[number],
  string
> = {
  APPOINTMENT_REMINDER: 'Appointment Reminder',
  APPOINTMENT_CONFIRMED: 'Appointment Confirmed',
  APPOINTMENT_CANCELLED: 'Appointment Cancelled',
  NO_SHOW: 'No-Show Follow-Up',
  POST_VISIT: 'Post-Visit Follow-Up',
  NEW_PATIENT: 'New Patient Welcome',
  INTAKE_FORM_DUE: 'Intake Form Reminder',
  CUSTOM: 'Custom',
}
