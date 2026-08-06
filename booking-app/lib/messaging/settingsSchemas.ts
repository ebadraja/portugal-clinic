import { z } from 'zod'
import { isValidFormUrl, normalizeFormUrl } from '@/lib/messaging/practiceForms'

const formUrlSchema = z
  .string()
  .min(1)
  .max(500)
  .transform(normalizeFormUrl)
  .refine(isValidFormUrl, { message: 'Enter a valid form URL (e.g. https://hptz.io/...)' })

export const practiceFormSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional().default(''),
  url: formUrlSchema,
  isActive: z.boolean().default(true),
})

const messageReason = z.enum([
  'SCHEDULING',
  'REFILL',
  'QUESTION',
  'URGENT',
  'INSURANCE',
  'RECORDS',
  'OTHER',
])

export const messagingSettingsBody = z.object({
  messagingEnabled: z.boolean().optional(),
  messagingBusinessHours: z.record(z.string(), z.unknown()).nullable().optional(),
  defaultRoutingRules: z.record(messageReason, z.string()).nullable().optional(),
  webChatWidgetConfig: z
    .object({
      enabled: z.boolean().optional(),
      welcomeMessage: z.string().max(2000).optional(),
      offlineMessage: z.string().max(2000).optional(),
      primaryColor: z.string().max(20).optional(),
      position: z.enum(['bottom-right', 'bottom-left']).optional(),
    })
    .nullable()
    .optional(),
  portalConfig: z
    .object({
      baseUrl: z.string().max(500).optional(),
      practiceForms: z.array(practiceFormSchema).optional(),
      defaultIntakeFormId: z.string().min(1).max(64).optional(),
      fileSharing: z
        .object({
          maxFileSizeMb: z.union([z.literal(5), z.literal(10), z.literal(25)]).optional(),
          allowImages: z.boolean().optional(),
          allowPdf: z.boolean().optional(),
          allowWord: z.boolean().optional(),
          allowPlainText: z.boolean().optional(),
        })
        .optional(),
    })
    .nullable()
    .optional(),
  smsProviderConfig: z
    .object({
      sendNotificationOnStaffReply: z.boolean().optional(),
      sendOtpCodes: z.boolean().optional(),
    })
    .nullable()
    .optional(),
})

export const REASON_OPTIONS = messageReason.options
