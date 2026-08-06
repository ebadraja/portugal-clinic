import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireStaffSession } from '@/lib/messaging/session'
import { createTemplateBody } from '@/lib/messaging/schemas'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const templates = await prisma.messageTemplate.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        category: true,
        body: true,
        channel: true,
        isLocked: true,
        usageCount: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    })

    return NextResponse.json({ data: templates })
  } catch (error) {
    console.error('[GET /api/messaging/templates]', error)
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = createTemplateBody.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const template = await prisma.messageTemplate.create({
      data: {
        ...parsed.data,
        createdById: staff.id,
      },
      select: {
        id: true,
        name: true,
        category: true,
        body: true,
        channel: true,
        isLocked: true,
        usageCount: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    console.error('[POST /api/messaging/templates]', error)
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }
}
