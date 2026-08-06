import { NextResponse } from 'next/server'
import { requireStaffSession } from '@/lib/messaging/session'
import { loadFileSharingConfig } from '@/lib/messaging/fileSharingServer'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const config = await loadFileSharingConfig()
    return NextResponse.json(config)
  } catch (error) {
    console.error('[GET /api/messaging/file-sharing-config]', error)
    return NextResponse.json({ error: 'Failed to load file sharing settings' }, { status: 500 })
  }
}
