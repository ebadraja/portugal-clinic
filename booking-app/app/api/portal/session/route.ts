import { NextResponse } from 'next/server'
import { getPortalSessionFromCookies } from '@/lib/messaging/portalAuth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getPortalSessionFromCookies()
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    return NextResponse.json({
      authenticated: true,
      patient: {
        id: session.patient.id,
        firstName: session.patient.firstName,
        lastName: session.patient.lastName,
      },
      expiresAt: session.expiresAt,
    })
  } catch (error) {
    console.error('[GET /api/portal/session]', error)
    return NextResponse.json({ error: 'Session check failed' }, { status: 500 })
  }
}
