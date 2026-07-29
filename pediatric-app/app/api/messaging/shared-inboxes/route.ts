import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireStaffSession } from '@/lib/messaging/session'
import { createSharedInboxBody } from '@/lib/messaging/schemas'
import { listSharedInboxesForStaff } from '@/lib/messaging/sharedInboxes'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await listSharedInboxesForStaff(staff.id)
    return NextResponse.json({ data })
  } catch (error) {
    console.error('[GET /api/messaging/shared-inboxes]', error)
    return NextResponse.json({ error: 'Failed to fetch shared inboxes' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (staff.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only administrators can create shared inboxes' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = createSharedInboxBody.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const inbox = await prisma.sharedInbox.create({
      data: parsed.data,
    })

    return NextResponse.json(inbox, { status: 201 })
  } catch (error) {
    console.error('[POST /api/messaging/shared-inboxes]', error)
    return NextResponse.json({ error: 'Failed to create shared inbox' }, { status: 500 })
  }
}
