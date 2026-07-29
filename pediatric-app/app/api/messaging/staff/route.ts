import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireStaffSession } from '@/lib/messaging/session'

export const dynamic = 'force-dynamic'

/** Active staff list for conversation assignment (all authenticated staff). */
export async function GET() {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const users = await prisma.user.findMany({
      where: { isActive: true, approvalStatus: 'APPROVED' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    return NextResponse.json({ data: users })
  } catch (error) {
    console.error('[GET /api/messaging/staff]', error)
    return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 })
  }
}
