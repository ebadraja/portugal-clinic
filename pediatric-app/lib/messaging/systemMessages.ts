import prisma from '@/lib/prisma'
import type { MessageContentType, Prisma } from '@/lib/generated/prisma/client'
import { getOrCreatePatientConversation } from '@/lib/messaging/portalAuth'
import { encryptMessageContent, previewText } from '@/lib/messaging/serialize'

type AppendSystemMessageInput = {
  patientId: string
  content: string
  contentType?: MessageContentType
  metadata?: Prisma.InputJsonValue
  /** Update conversation preview (default true). */
  updatePreview?: boolean
}

/**
 * Append a system-visible message to the patient's unified conversation.
 * Creates a conversation if one does not exist yet.
 */
export async function appendSystemMessage(input: AppendSystemMessageInput) {
  const {
    patientId,
    content,
    contentType = 'SYSTEM_EVENT',
    metadata,
    updatePreview = true,
  } = input

  let conversation = await prisma.conversation.findUnique({ where: { patientId } })
  if (!conversation) {
    conversation = await getOrCreatePatientConversation(patientId)
  }

  const now = new Date()

  return prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        conversationId: conversation!.id,
        senderType: 'SYSTEM',
        channel: 'SYSTEM',
        content: encryptMessageContent(content),
        contentType,
        deliveryStatus: 'DELIVERED',
        metadata: metadata ?? undefined,
      },
    })

    if (updatePreview) {
      await tx.conversation.update({
        where: { id: conversation!.id },
        data: {
          lastMessageAt: now,
          lastMessagePreview: previewText(content),
        },
      })
    }

    return message
  })
}
