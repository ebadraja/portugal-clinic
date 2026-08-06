import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// ── GET /api/patient-drafts/new-count?since=<ISO> ─────────────────────────────
// Count of PatientDraft rows awaiting review (PENDING) created after `since`.
// Mirrors /api/call-logs/new-count and /api/intake-forms/new-count for the
// sidebar Patients badge via NAV_COUNT_SOURCES in components/sidebar.tsx.

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Draft list is ADMIN-only today — non-admins get a quiet 0 badge.
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ count: 0 })
    }

    const sinceParam = request.nextUrl.searchParams.get('since')
    const parsed = sinceParam ? new Date(sinceParam) : new Date()
    const since = isNaN(parsed.getTime()) ? new Date() : parsed

    const count = await prisma.patientDraft.count({
      where: {
        status: 'PENDING',
        createdAt: { gt: since },
      },
    })

    return NextResponse.json({ count })
  } catch (error) {
    console.error('[GET /api/patient-drafts/new-count]', error)
    return NextResponse.json({ error: 'Failed to fetch count' }, { status: 500 })
  }
}
