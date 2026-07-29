import prisma from '@/lib/prisma'
import type { Role } from '@/lib/generated/prisma/client'

const MESSAGING_NOTIFY_ROLES: Role[] = ['ADMIN', 'STAFF']

type NewMessageNotifyInput = {
  conversationId: string
  patientFirstName: string
  patientLastName: string
  preview: string
  assignedToId?: string | null
}

type AssignedNotifyInput = {
  conversationId: string
  patientFirstName: string
  patientLastName: string
  assignedToId: string
  assignedByName?: string
}

async function activeStaffRecipients(assignedToId?: string | null) {
  if (assignedToId) {
    const user = await prisma.user.findUnique({
      where: { id: assignedToId, isActive: true },
      select: { id: true },
    })
    return user ? [user] : []
  }

  return prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: MESSAGING_NOTIFY_ROLES },
    },
    select: { id: true },
  })
}

/** Notify staff when a patient sends a message (portal, web chat, future SMS). */
export async function notifyStaffNewMessage(input: NewMessageNotifyInput) {
  const recipients = await activeStaffRecipients(input.assignedToId)
  if (recipients.length === 0) return

  const actionUrl = `/messaging/${input.conversationId}`
  const title = 'New patient message'
  const message = `${input.patientFirstName} ${input.patientLastName}: ${input.preview}`

  await prisma.notification.createMany({
    data: recipients.map((user) => ({
      userId: user.id,
      type: 'new_message',
      title,
      message,
      icon: 'message',
      entityType: 'conversation',
      entityId: input.conversationId,
      actionUrl,
    })),
  })
}

/** Notify assignee when a conversation is assigned to them. */
export async function notifyStaffMessageAssigned(input: AssignedNotifyInput) {
  const actionUrl = `/messaging/${input.conversationId}`
  const by = input.assignedByName ? ` by ${input.assignedByName}` : ''
  const message = `${input.patientFirstName} ${input.patientLastName} was assigned to you${by}.`

  await prisma.notification.create({
    data: {
      userId: input.assignedToId,
      type: 'message_assigned',
      title: 'Conversation assigned',
      message,
      icon: 'message',
      entityType: 'conversation',
      entityId: input.conversationId,
      actionUrl,
    },
  })
}
