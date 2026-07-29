import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getOfflineMessage, isWithinBusinessHours } from '@/lib/messaging/businessHours'
import {
  chatbotJsonResponse,
  handleChatbotPreflight,
} from '@/lib/chatbot/cors'

export const dynamic = 'force-dynamic'

const WEBCHAT_CORS = { credentials: true as const }

type WidgetConfig = {
  enabled?: boolean
  welcomeMessage?: string
  offlineMessage?: string
  primaryColor?: string
  position?: 'bottom-right' | 'bottom-left'
}

export async function OPTIONS(request: NextRequest) {
  return handleChatbotPreflight(request, WEBCHAT_CORS) ?? new NextResponse(null, { status: 405 })
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const settings = await prisma.settings.findFirst({
      select: {
        practiceName: true,
        practicePhone: true,
        messagingBusinessHours: true,
        webChatWidgetConfig: true,
      },
    })

    const widget = (settings?.webChatWidgetConfig ?? {}) as WidgetConfig
    const hours = settings?.messagingBusinessHours as Record<string, unknown> | null
    const online = isWithinBusinessHours(hours as never)

    return chatbotJsonResponse(
      {
        // Public webchat (GIGI + standalone widget) — widget config only, not staff CRM toggle
        enabled: widget.enabled !== false,
        practiceName: settings?.practiceName ?? 'Kids 0-18 Integrated Pediatrics',
        practicePhone: settings?.practicePhone ?? null,
        welcomeMessage:
          widget.welcomeMessage ??
          'Hi! How can we help you today? Please share your name, phone, and reason for contacting us.',
        offlineMessage: getOfflineMessage(widget),
        primaryColor: widget.primaryColor ?? '#2563eb',
        position: widget.position ?? 'bottom-right',
        isOnline: online,
      },
      origin,
      undefined,
      WEBCHAT_CORS,
    )
  } catch (error) {
    console.error('[GET /api/webchat/init]', error)
    return chatbotJsonResponse({ error: 'Failed to load widget config' }, origin, { status: 500 }, WEBCHAT_CORS)
  }
}
