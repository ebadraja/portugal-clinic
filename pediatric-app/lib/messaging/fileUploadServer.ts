import { randomUUID } from 'crypto'
import type { ConversationStatus, MessageContentType, MessageSenderType } from '@/lib/generated/prisma/client'
import prisma from '@/lib/prisma'
import {
  attachmentPreviewText,
  sanitizeFilename,
  validateUploadFile,
} from '@/lib/messaging/fileAttachments'
import { loadFileSharingConfig } from '@/lib/messaging/fileSharingServer'
import { getSignedDownloadUrl, uploadFile, deleteFile, fileExistsOnLocalDisk } from '@/lib/messaging/fileStorage'
import { encryptMessageContent, previewText, serializeMessage } from '@/lib/messaging/serialize'

export type ProcessFileUploadInput = {
  buffer: Buffer
  declaredMimeType: string
  originalFilename: string
  conversationId: string
  senderType: MessageSenderType
  senderId?: string | null
  channel: 'PORTAL' | 'SYSTEM'
  uploadedBy: 'staff' | 'patient'
  uploaderId: string
  auditUserId?: string | null
}

export type ProcessFileUploadResult =
  | { ok: true; message: ReturnType<typeof serializeMessage>; downloadUrl: string }
  | { ok: false; status: number; error: string }

export async function processFileUpload(
  input: ProcessFileUploadInput,
): Promise<ProcessFileUploadResult> {
  const config = await loadFileSharingConfig()
  const validation = validateUploadFile(
    input.buffer,
    input.declaredMimeType,
    input.originalFilename,
    config,
  )

  if (!validation.ok) {
    return { ok: false, status: validation.status, error: validation.error }
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, patientId: true },
  })
  if (!conversation) {
    return { ok: false, status: 404, error: 'Conversation not found' }
  }

  const messageId = randomUUID()
  const safeName = sanitizeFilename(input.originalFilename)
  const storageFilename = `${Date.now()}-${safeName}`
  const originalName = safeName

  let storageKey: string | null = null
  try {
    const uploaded = await uploadFile({
      file: input.buffer,
      filename: storageFilename,
      mimeType: validation.mimeType,
      conversationId: input.conversationId,
      messageId,
    })
    storageKey = uploaded.storageKey

    const metadata = {
      storageKey: uploaded.storageKey,
      originalName,
      mimeType: validation.mimeType,
      sizeBytes: input.buffer.length,
    }

    const now = new Date()
    const plainPreview = attachmentPreviewText(originalName, validation.mimeType)

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          id: messageId,
          conversationId: input.conversationId,
          senderType: input.senderType,
          senderId: input.senderId ?? null,
          channel: input.channel,
          content: encryptMessageContent(originalName),
          contentType: validation.contentType as MessageContentType,
          deliveryStatus: 'DELIVERED',
          metadata,
        },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true } },
        },
      })

      const conversationUpdate: {
        lastMessageAt: Date
        lastMessagePreview: string
        status?: ConversationStatus
        unreadCount?: { increment: number }
      } = {
        lastMessageAt: now,
        lastMessagePreview: previewText(plainPreview),
      }

      if (input.uploadedBy === 'patient') {
        conversationUpdate.status = 'OPEN'
        conversationUpdate.unreadCount = { increment: 1 }
      } else {
        conversationUpdate.status = 'AWAITING_REPLY'
      }

      await tx.conversation.update({
        where: { id: input.conversationId },
        data: conversationUpdate,
      })

      await tx.auditLog.create({
        data: {
          userId: input.auditUserId ?? null,
          action: 'MESSAGE_SENT',
          entity: 'message',
          entityId: created.id,
          changes: {
            conversationId: input.conversationId,
            uploadedBy: input.uploadedBy,
            mimeType: validation.mimeType,
            sizeBytes: input.buffer.length,
            contentType: validation.contentType,
            fileUpload: true,
            ...(input.uploadedBy === 'patient' ? { patientId: input.uploaderId } : {}),
          },
        },
      })

      return created
    })

    const downloadUrl = (await fileExistsOnLocalDisk(storageKey))
      ? `/api/messaging/files/${messageId}`
      : await getSignedDownloadUrl(storageKey)
    return {
      ok: true,
      message: serializeMessage(message),
      downloadUrl,
    }
  } catch (error) {
    if (storageKey) {
      await deleteFile(storageKey).catch(() => undefined)
    }
    console.error('[processFileUpload]', error)
    const message = error instanceof Error ? error.message : 'Failed to upload file'
    return { ok: false, status: 500, error: message }
  }
}
