import { NextRequest, NextResponse } from 'next/server'
import { requireStaffSession } from '@/lib/messaging/session'
import { buildPatientTimeline } from '@/lib/messaging/timeline'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ patientId: string }> }

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { patientId } = await params
    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get('limit') ?? '60', 10) || 60,
      100,
    )

    const data = await buildPatientTimeline(patientId, limit)
    return NextResponse.json({ data })
  } catch (error) {
    console.error('[GET /api/messaging/timeline/[patientId]]', error)
    return NextResponse.json({ error: 'Failed to load timeline' }, { status: 500 })
  }
}
