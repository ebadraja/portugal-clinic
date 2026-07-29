import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { parseFileSharingConfig } from '@/lib/messaging/fileSharingConfig'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const settings = await prisma.settings.findFirst({
      select: {
        practiceName: true,
        practicePhone: true,
        practiceTagline: true,
        portalConfig: true,
        webChatWidgetConfig: true,
      },
    })

    const widget = (settings?.webChatWidgetConfig ?? {}) as { primaryColor?: string }
    const fileSharing = parseFileSharingConfig(settings?.portalConfig)

    return NextResponse.json({
      practiceName: settings?.practiceName ?? 'Kids 0-18 Integrated Pediatrics',
      practicePhone: settings?.practicePhone ?? null,
      practiceTagline: settings?.practiceTagline ?? null,
      portalConfig: settings?.portalConfig ?? null,
      primaryColor: widget.primaryColor ?? '#2563eb',
      fileSharing,
    })
  } catch (error) {
    console.error('[GET /api/portal/settings]', error)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}
