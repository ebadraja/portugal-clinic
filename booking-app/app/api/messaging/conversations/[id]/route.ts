import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireStaffSession } from '@/lib/messaging/session'
import { patchConversationBody } from '@/lib/messaging/schemas'
import { serializeConversation } from '@/lib/messaging/serialize'

export const dynamic = 'force-dynamic'

const conversationInclude = {
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      parentName: true,
      dateOfBirth: true,
    },
  },
  assignedTo: {
    select: { id: true, firstName: true, lastName: true },
  },
  assignedInbox: {
    select: { id: true, name: true },
  },
} as const

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: conversationInclude,
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    await prisma.auditLog.create({
      data: {
        userId: staff.id,
        action: 'READ',
        entity: 'conversation',
        entityId: conversation.id,
      },
    })

    return NextResponse.json(serializeConversation(conversation))
  } catch (error) {
    console.error('[GET /api/messaging/conversations/[id]]', error)
    return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const parsed = patchConversationBody.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const existing = await prisma.conversation.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const { status, markRead } = parsed.data
    const now = new Date()

    const conversation = await prisma.$transaction(async (tx) => {
      if (markRead) {
        await tx.message.updateMany({
          where: {
            conversationId: id,
            senderType: 'PATIENT',
            readAt: null,
          },
          data: { readAt: now, deliveryStatus: 'READ' },
        })

        await tx.auditLog.create({
          data: {
            userId: staff.id,
            action: 'MESSAGE_READ',
            entity: 'conversation',
            entityId: id,
          },
        })
      }

      const updated = await tx.conversation.update({
        where: { id },
        data: {
          ...(status ? { status } : {}),
          ...(markRead ? { unreadCount: 0 } : {}),
        },
        include: conversationInclude,
      })

      if (status === 'RESOLVED' || status === 'ARCHIVED') {
        await tx.auditLog.create({
          data: {
            userId: staff.id,
            action: 'CONVERSATION_RESOLVED',
            entity: 'conversation',
            entityId: id,
            changes: { status },
          },
        })
      } else if (status === 'OPEN' && existing.status !== 'OPEN') {
        await tx.auditLog.create({
          data: {
            userId: staff.id,
            action: 'UPDATE',
            entity: 'conversation',
            entityId: id,
            changes: { status: 'reopened' },
          },
        })
      }

      return updated
    })

    return NextResponse.json(serializeConversation(conversation))
  } catch (error) {
    console.error('[PATCH /api/messaging/conversations/[id]]', error)
    return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 })
  }
}
