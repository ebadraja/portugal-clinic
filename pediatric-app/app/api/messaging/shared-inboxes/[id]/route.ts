import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireStaffSession } from '@/lib/messaging/session'
import { updateSharedInboxBody } from '@/lib/messaging/schemas'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (staff.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only administrators can update shared inboxes' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const parsed = updateSharedInboxBody.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const inbox = await prisma.sharedInbox.update({
      where: { id },
      data: parsed.data,
    })

    return NextResponse.json(inbox)
  } catch (error) {
    console.error('[PATCH /api/messaging/shared-inboxes/[id]]', error)
    return NextResponse.json({ error: 'Failed to update shared inbox' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (staff.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only administrators can delete shared inboxes' }, { status: 403 })
    }

    const { id } = await params
    const inbox = await prisma.sharedInbox.findUnique({ where: { id } })
    if (!inbox) {
      return NextResponse.json({ error: 'Shared inbox not found' }, { status: 404 })
    }
    if (inbox.isDefault) {
      return NextResponse.json({ error: 'Default shared inboxes cannot be deleted' }, { status: 400 })
    }

    await prisma.sharedInbox.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/messaging/shared-inboxes/[id]]', error)
    return NextResponse.json({ error: 'Failed to delete shared inbox' }, { status: 500 })
  }
}
