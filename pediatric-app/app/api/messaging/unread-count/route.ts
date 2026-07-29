import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireStaffSession } from '@/lib/messaging/session'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await prisma.conversation.aggregate({
      _sum: { unreadCount: true },
    })

    return NextResponse.json({
      unreadCount: result._sum.unreadCount ?? 0,
    })
  } catch (error) {
    console.error('[GET /api/messaging/unread-count]', error)
    return NextResponse.json({ error: 'Failed to fetch unread count' }, { status: 500 })
  }
}
