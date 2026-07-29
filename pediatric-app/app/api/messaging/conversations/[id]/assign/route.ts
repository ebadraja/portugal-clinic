import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireStaffSession } from '@/lib/messaging/session'
import { assignConversationBody } from '@/lib/messaging/schemas'
import { serializeConversation } from '@/lib/messaging/serialize'
import { notifyStaffMessageAssigned } from '@/lib/messaging/notifications'

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

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const parsed = assignConversationBody.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const existing = await prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        assignedToId: true,
        assignedInboxId: true,
      },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const { assignedToId, assignedInboxId, reason } = parsed.data

    if (assignedToId === undefined && assignedInboxId === undefined) {
      return NextResponse.json(
        { error: 'Provide assignedToId and/or assignedInboxId' },
        { status: 400 },
      )
    }

    if (assignedToId) {
      const user = await prisma.user.findUnique({ where: { id: assignedToId } })
      if (!user || !user.isActive) {
        return NextResponse.json({ error: 'Assignee not found' }, { status: 404 })
      }
    }

    if (assignedInboxId) {
      const inbox = await prisma.sharedInbox.findUnique({ where: { id: assignedInboxId } })
      if (!inbox) {
        return NextResponse.json({ error: 'Shared inbox not found' }, { status: 404 })
      }
    }

    const conversation = await prisma.$transaction(async (tx) => {
      await tx.conversationAssignmentLog.create({
        data: {
          conversationId: id,
          fromUserId: existing.assignedToId,
          toUserId: assignedToId ?? null,
          toInboxId: assignedInboxId ?? null,
          reason: reason ?? null,
        },
      })

      const updated = await tx.conversation.update({
        where: { id },
        data: {
          ...(assignedToId !== undefined ? { assignedToId } : {}),
          ...(assignedInboxId !== undefined ? { assignedInboxId } : {}),
        },
        include: conversationInclude,
      })

      await tx.auditLog.create({
        data: {
          userId: staff.id,
          action: 'CONVERSATION_ASSIGNED',
          entity: 'conversation',
          entityId: id,
          changes: {
            fromUserId: existing.assignedToId,
            toUserId: assignedToId ?? null,
            toInboxId: assignedInboxId ?? null,
            reason: reason ?? null,
          },
        },
      })

      return updated
    })

    if (assignedToId && assignedToId !== existing.assignedToId) {
      void notifyStaffMessageAssigned({
        conversationId: id,
        patientFirstName: conversation.patient.firstName,
        patientLastName: conversation.patient.lastName,
        assignedToId,
        assignedByName: `${staff.firstName ?? ''} ${staff.lastName ?? ''}`.trim() || undefined,
      }).catch((err) => console.error('[assign] notification failed:', err))
    }

    return NextResponse.json(serializeConversation(conversation))
  } catch (error) {
    console.error('[POST /api/messaging/conversations/[id]/assign]', error)
    return NextResponse.json({ error: 'Failed to assign conversation' }, { status: 500 })
  }
}
