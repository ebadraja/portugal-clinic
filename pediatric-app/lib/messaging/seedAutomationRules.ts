import prisma from '@/lib/prisma'
import type { MessagingTriggerEvent } from '@/lib/generated/prisma/client'

type DefaultRule = {
  name: string
  triggerEvent: MessagingTriggerEvent
  delayMinutes: number
  category: string
  body: string
}

const DEFAULT_RULES: DefaultRule[] = [
  {
    name: '48-Hour Appointment Reminder',
    triggerEvent: 'APPOINTMENT_REMINDER',
    delayMinutes: 2880,
    category: 'Automation',
    body:
      'Kids 0-18 Pediatrics: You have an appointment on {{appointment.date}} at {{appointment.time}}. View details or message us: {{portal.link}}',
  },
  {
    name: '24-Hour Appointment Reminder',
    triggerEvent: 'APPOINTMENT_REMINDER',
    delayMinutes: 1440,
    category: 'Automation',
    body:
      'Kids 0-18 Pediatrics: Reminder - your appointment is tomorrow at {{appointment.time}}. View details: {{portal.link}}',
  },
  {
    name: '2-Hour Appointment Reminder',
    triggerEvent: 'APPOINTMENT_REMINDER',
    delayMinutes: 120,
    category: 'Automation',
    body:
      'Kids 0-18 Pediatrics: Your appointment is in 2 hours at {{appointment.time}}. See you soon! Details: {{portal.link}}',
  },
  {
    name: 'No-Show Follow-Up',
    triggerEvent: 'NO_SHOW',
    delayMinutes: 1440,
    category: 'Automation',
    body:
      'Kids 0-18 Pediatrics: We missed you at your appointment. To reschedule, message us here: {{portal.link}} or call (253) 400-4479',
  },
  {
    name: 'New Patient Welcome',
    triggerEvent: 'NEW_PATIENT',
    delayMinutes: 0,
    category: 'Automation',
    body:
      'Welcome to Kids 0-18 Pediatrics, {{patient.firstName}}! Access your secure patient portal anytime: {{portal.link}}',
  },
  {
    name: 'Intake Form Reminder',
    triggerEvent: 'INTAKE_FORM_DUE',
    delayMinutes: 4320,
    category: 'Automation',
    body:
      'Kids 0-18 Pediatrics: Please complete your intake forms before your upcoming visit. Open here: {{portal.link}}',
  },
]

async function resolveSeedAuthorId(): Promise<string> {
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true },
  })
  if (admin) return admin.id

  const anyUser = await prisma.user.findFirst({ select: { id: true } })
  if (!anyUser) {
    throw new Error('Cannot seed automation rules — no users in database')
  }
  return anyUser.id
}

/**
 * Seed default MessagingAutomationRules when none exist.
 * Safe to call on every scheduler tick / settings load.
 */
export async function seedDefaultAutomationRules(): Promise<number> {
  const existing = await prisma.messagingAutomationRule.count()
  if (existing > 0) return 0

  const createdById = await resolveSeedAuthorId()
  let created = 0

  for (const rule of DEFAULT_RULES) {
    const template = await prisma.messageTemplate.create({
      data: {
        name: rule.name,
        category: rule.category,
        body: rule.body,
        channel: 'SMS',
        isLocked: false,
        createdById,
      },
    })

    await prisma.messagingAutomationRule.create({
      data: {
        name: rule.name,
        triggerEvent: rule.triggerEvent,
        delayMinutes: rule.delayMinutes,
        templateId: template.id,
        channel: 'SMS',
        isActive: true,
        conditions: { suppressEmailForSameTrigger: true },
      },
    })

    created++
  }

  console.log(`[message-scheduler] seeded ${created} default automation rules`)
  return created
}
