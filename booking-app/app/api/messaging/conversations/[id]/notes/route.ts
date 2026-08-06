import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireStaffSession } from '@/lib/messaging/session'
import { internalNoteBody } from '@/lib/messaging/schemas'
import {
  encryptMessageContent,
  previewText,
  serializeMessage,
  INTERNAL_NOTE_DEFAULTS,
} from '@/lib/messaging/serialize'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: conversationId } = await params
    const body = await request.json()
    const parsed = internalNoteBody.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true },
    })
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const { content } = parsed.data
    const now = new Date()

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderId: staff.id,
          content: encryptMessageContent(content),
          ...INTERNAL_NOTE_DEFAULTS,
        },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true } },
        },
      })

      // Internal notes update preview for staff only — prefix for clarity
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: now,
          lastMessagePreview: previewText(`[Internal] ${content}`),
        },
      })

      await tx.auditLog.create({
        data: {
          userId: staff.id,
          action: 'CREATE',
          entity: 'internal_note',
          entityId: created.id,
          changes: { conversationId },
        },
      })

      return created
    })

    return NextResponse.json(serializeMessage(message), { status: 201 })
  } catch (error) {
    console.error('[POST /api/messaging/conversations/[id]/notes]', error)
    return NextResponse.json({ error: 'Failed to add internal note' }, { status: 500 })
  }
}
