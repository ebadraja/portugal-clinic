import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireStaffSession } from '@/lib/messaging/session'
import { listMessagesQuery, sendMessageBody } from '@/lib/messaging/schemas'
import { resolveMessagingMergeTags } from '@/lib/messaging/mergeTags'
import {
  encryptMessageContent,
  previewText,
  serializeMessage,
  STAFF_MESSAGE_DEFAULTS,
} from '@/lib/messaging/serialize'
import { notifyPatientOfNewMessage } from '@/lib/messaging/notifications-sms'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const query = Object.fromEntries(request.nextUrl.searchParams.entries())
    const parsed = listMessagesQuery.safeParse(query)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const conversation = await prisma.conversation.findUnique({ where: { id } })
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const { page, limit } = parsed.data

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId: id },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.message.count({ where: { conversationId: id } }),
    ])

    return NextResponse.json({
      data: messages.map(serializeMessage),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('[GET /api/messaging/conversations/[id]/messages]', error)
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: conversationId } = await params
    const body = await request.json()
    const parsed = sendMessageBody.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, patientId: true },
    })
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    let { content, channel, templateId } = parsed.data

    if (templateId) {
      const template = await prisma.messageTemplate.findUnique({
        where: { id: templateId },
      })
      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }
      content = await resolveMessagingMergeTags(template.body, {
        patientId: conversation.patientId,
      })
      await prisma.messageTemplate.update({
        where: { id: templateId },
        data: { usageCount: { increment: 1 } },
      })
    }

    const now = new Date()
    const plainPreview = previewText(content)

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderId: staff.id,
          content: encryptMessageContent(content),
          ...STAFF_MESSAGE_DEFAULTS,
          channel,
        },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true } },
        },
      })

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          status: 'AWAITING_REPLY',
          lastMessageAt: now,
          lastMessagePreview: plainPreview,
        },
      })

      await tx.auditLog.create({
        data: {
          userId: staff.id,
          action: 'MESSAGE_SENT',
          entity: 'message',
          entityId: created.id,
          changes: { conversationId, channel },
        },
      })

      return created
    })

    void notifyPatientOfNewMessage({
      patientId: conversation.patientId,
      conversationId,
      staffName: [staff.firstName, staff.lastName].filter(Boolean).join(' ') || undefined,
    }).catch((err) => {
      console.error('[sms] notifyPatientOfNewMessage failed:', (err as Error).message)
    })

    return NextResponse.json(serializeMessage(message), { status: 201 })
  } catch (error) {
    console.error('[POST /api/messaging/conversations/[id]/messages]', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
