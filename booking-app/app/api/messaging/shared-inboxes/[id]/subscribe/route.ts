import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireStaffSession } from '@/lib/messaging/session'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const inbox = await prisma.sharedInbox.findUnique({ where: { id } })
    if (!inbox) {
      return NextResponse.json({ error: 'Shared inbox not found' }, { status: 404 })
    }

    await prisma.sharedInboxMember.upsert({
      where: {
        sharedInboxId_userId: { sharedInboxId: id, userId: staff.id },
      },
      create: { sharedInboxId: id, userId: staff.id },
      update: {},
    })

    return NextResponse.json({ success: true, subscribed: true })
  } catch (error) {
    console.error('[POST /api/messaging/shared-inboxes/[id]/subscribe]', error)
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    await prisma.sharedInboxMember.deleteMany({
      where: { sharedInboxId: id, userId: staff.id },
    })

    return NextResponse.json({ success: true, subscribed: false })
  } catch (error) {
    console.error('[DELETE /api/messaging/shared-inboxes/[id]/subscribe]', error)
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 })
  }
}
