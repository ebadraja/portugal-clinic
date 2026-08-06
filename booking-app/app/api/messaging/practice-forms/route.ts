import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireStaffSession } from '@/lib/messaging/session'
import { getActivePracticeForms, parsePracticeForms } from '@/lib/messaging/practiceForms'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const settings = await prisma.settings.findFirst({
      select: { portalConfig: true },
    })

    const forms = getActivePracticeForms(parsePracticeForms(settings?.portalConfig))

    return NextResponse.json({ data: forms })
  } catch (error) {
    console.error('[GET /api/messaging/practice-forms]', error)
    return NextResponse.json({ error: 'Failed to load practice forms' }, { status: 500 })
  }
}
