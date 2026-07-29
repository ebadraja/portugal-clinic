import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@/lib/generated/prisma/client'
import prisma from '@/lib/prisma'
import { requireStaffSession } from '@/lib/messaging/session'
import { listConversationsQuery, createConversationBody } from '@/lib/messaging/schemas'
import { resolveInboxForReason } from '@/lib/messaging/router'
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

export async function GET(request: NextRequest) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = Object.fromEntries(request.nextUrl.searchParams.entries())
    const parsed = listConversationsQuery.safeParse(params)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { inbox, sharedInboxId, status, search, dateFrom, dateTo, page, limit } = parsed.data
    const where: Prisma.ConversationWhereInput = {}

    if (status) where.status = status

    if (inbox === 'unassigned') {
      where.assignedToId = null
      where.assignedInboxId = null
    } else if (inbox === 'mine') {
      where.assignedToId = staff.id
    } else if (inbox === 'shared') {
      if (!sharedInboxId) {
        return NextResponse.json(
          { error: 'sharedInboxId is required when inbox=shared' },
          { status: 400 },
        )
      }
      where.assignedInboxId = sharedInboxId
    }

    if (search?.trim()) {
      const term = search.trim()
      where.OR = [
        { patient: { firstName: { contains: term, mode: 'insensitive' } } },
        { patient: { lastName: { contains: term, mode: 'insensitive' } } },
        { patient: { phone: { contains: term, mode: 'insensitive' } } },
        { patient: { parentName: { contains: term, mode: 'insensitive' } } },
        { lastMessagePreview: { contains: term, mode: 'insensitive' } },
      ]
    }

    if (dateFrom || dateTo) {
      const lastMessageAt: Prisma.DateTimeFilter = {}
      if (dateFrom) {
        const from = new Date(dateFrom)
        if (!isNaN(from.getTime())) lastMessageAt.gte = from
      }
      if (dateTo) {
        const to = new Date(dateTo)
        if (!isNaN(to.getTime())) {
          to.setHours(23, 59, 59, 999)
          lastMessageAt.lte = to
        }
      }
      if (Object.keys(lastMessageAt).length > 0) {
        where.lastMessageAt = lastMessageAt
      }
    }

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: conversationInclude,
        orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.conversation.count({ where }),
    ])

    return NextResponse.json({
      data: conversations.map(serializeConversation),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('[GET /api/messaging/conversations]', error)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = createConversationBody.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { patientId, reason } = parsed.data

    const patient = await prisma.patient.findUnique({ where: { id: patientId } })
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    const existing = await prisma.conversation.findUnique({ where: { patientId } })
    if (existing) {
      return NextResponse.json(
        { error: 'Conversation already exists for this patient', conversationId: existing.id },
        { status: 409 },
      )
    }

    const assignedInboxId = await resolveInboxForReason(reason ?? null)

    const conversation = await prisma.conversation.create({
      data: {
        patientId,
        reason: reason ?? null,
        assignedInboxId,
        status: 'OPEN',
      },
      include: conversationInclude,
    })

    await prisma.auditLog.create({
      data: {
        userId: staff.id,
        action: 'CREATE',
        entity: 'conversation',
        entityId: conversation.id,
      },
    })

    return NextResponse.json(serializeConversation(conversation), { status: 201 })
  } catch (error) {
    console.error('[POST /api/messaging/conversations]', error)
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }
}
