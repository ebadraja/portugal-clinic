import { decrypt, encryptMessage } from '@/lib/crypto'
import type {
  Conversation,
  Message,
  MessageChannel,
  MessageContentType,
  MessageDeliveryStatus,
  MessageSenderType,
  Patient,
  User,
  SharedInbox,
} from '@/lib/generated/prisma/client'

type MessageWithSender = Message & {
  sender: Pick<User, 'id' | 'firstName' | 'lastName'> | null
}

type ConversationWithRelations = Conversation & {
  patient: Pick<
    Patient,
    'id' | 'firstName' | 'lastName' | 'phone' | 'email' | 'parentName' | 'dateOfBirth'
  >
  assignedTo: Pick<User, 'id' | 'firstName' | 'lastName'> | null
  assignedInbox: Pick<SharedInbox, 'id' | 'name'> | null
}

export function previewText(content: string, max = 100): string {
  const trimmed = content.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}…`
}

export function serializeMessage(message: MessageWithSender) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderType: message.senderType,
    senderId: message.senderId,
    senderName: message.sender
      ? `${message.sender.firstName} ${message.sender.lastName}`.trim()
      : null,
    channel: message.channel,
    content: decrypt(message.content),
    contentType: message.contentType,
    deliveryStatus: message.deliveryStatus,
    externalMessageId: message.externalMessageId,
    isInternalNote: message.isInternalNote,
    readAt: message.readAt,
    metadata: message.metadata,
    createdAt: message.createdAt,
  }
}

export function serializeConversation(conversation: ConversationWithRelations) {
  return {
    id: conversation.id,
    patientId: conversation.patientId,
    status: conversation.status,
    assignedToId: conversation.assignedToId,
    assignedInboxId: conversation.assignedInboxId,
    lastMessageAt: conversation.lastMessageAt,
    lastMessagePreview: conversation.lastMessagePreview,
    unreadCount: conversation.unreadCount,
    reason: conversation.reason,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    patient: conversation.patient,
    assignedTo: conversation.assignedTo,
    assignedInbox: conversation.assignedInbox,
  }
}

export function encryptMessageContent(content: string): string {
  return encryptMessage(content)
}

export const STAFF_MESSAGE_DEFAULTS = {
  senderType: 'STAFF' as MessageSenderType,
  contentType: 'TEXT' as MessageContentType,
  deliveryStatus: 'SENT' as MessageDeliveryStatus,
  channel: 'PORTAL' as MessageChannel,
}

export const INTERNAL_NOTE_DEFAULTS = {
  senderType: 'STAFF' as MessageSenderType,
  contentType: 'TEXT' as MessageContentType,
  deliveryStatus: 'SENT' as MessageDeliveryStatus,
  channel: 'SYSTEM' as MessageChannel,
  isInternalNote: true,
}
