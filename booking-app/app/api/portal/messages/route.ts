import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import {
  encryptMessageContent,
  previewText,
} from '@/lib/messaging/serialize'
import { decrypt } from '@/lib/crypto'
import {
  getOrCreatePatientConversation,
  getPortalSessionFromCookies,
} from '@/lib/messaging/portalAuth'
import { portalSendMessageBody } from '@/lib/messaging/portalSchemas'
import { resolveInboxForReason } from '@/lib/messaging/router'
import { notifyStaffNewMessage } from '@/lib/messaging/notifications'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getPortalSessionFromCookies()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const conversation = await prisma.conversation.findUnique({
      where: { patientId: session.patientId },
    })

    if (!conversation) {
      return NextResponse.json({ messages: [], conversationId: null, reason: null })
    }

    const messages = await prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        isInternalNote: false,
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    })

    return NextResponse.json({
      conversationId: conversation.id,
      reason: conversation.reason,
      messages: messages.map((m) => ({
        id: m.id,
        senderType: m.senderType,
        channel: m.channel,
        content: decrypt(m.content),
        contentType: m.contentType,
        metadata: m.metadata,
        createdAt: m.createdAt,
      })),
    })
  } catch (error) {
    console.error('[GET /api/portal/messages]', error)
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getPortalSessionFromCookies()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = portalSendMessageBody.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { content, reason } = parsed.data
    const now = new Date()

    let conversation = await prisma.conversation.findUnique({
      where: { patientId: session.patientId },
    })

    if (!conversation) {
      if (!reason) {
        return NextResponse.json(
          { error: 'Please select a reason for your message' },
          { status: 400 },
        )
      }
      conversation = await getOrCreatePatientConversation(session.patientId, reason)
    } else if (reason && !conversation.reason) {
      const assignedInboxId = await resolveInboxForReason(reason)
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { reason, assignedInboxId },
      })
    }

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId: conversation!.id,
          senderType: 'PATIENT',
          channel: 'PORTAL',
          content: encryptMessageContent(content),
          contentType: 'TEXT',
          deliveryStatus: 'DELIVERED',
        },
      })

      await tx.conversation.update({
        where: { id: conversation!.id },
        data: {
          status: 'OPEN',
          lastMessageAt: now,
          lastMessagePreview: previewText(content),
          unreadCount: { increment: 1 },
        },
      })

      return created
    })

    void notifyStaffNewMessage({
      conversationId: conversation!.id,
      patientFirstName: session.patient.firstName,
      patientLastName: session.patient.lastName,
      preview: previewText(content),
      assignedToId: conversation!.assignedToId,
    }).catch((err) => console.error('[portal] new message notification failed:', err))

    return NextResponse.json(
      {
        id: message.id,
        senderType: message.senderType,
        channel: message.channel,
        content,
        createdAt: message.createdAt,
        conversationId: conversation!.id,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('[POST /api/portal/messages]', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
