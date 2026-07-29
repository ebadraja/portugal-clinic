import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Prisma } from '@/lib/generated/prisma/client'
import prisma from '@/lib/prisma'
import { messagingSettingsBody } from '@/lib/messaging/settingsSchemas'
import { maskPhoneForDisplay, getTwilioFromNumber } from '@/lib/messaging/smsProvider'

export const dynamic = 'force-dynamic'

const SETTINGS_ID = 'singleton'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const settings = await prisma.settings.findFirst({
      select: {
        messagingEnabled: true,
        messagingBusinessHours: true,
        defaultRoutingRules: true,
        webChatWidgetConfig: true,
        portalConfig: true,
        smsProviderConfig: true,
      },
    })

    const fromNumber = getTwilioFromNumber()

    return NextResponse.json({
      messagingEnabled: settings?.messagingEnabled ?? false,
      messagingBusinessHours: settings?.messagingBusinessHours ?? null,
      defaultRoutingRules: settings?.defaultRoutingRules ?? null,
      webChatWidgetConfig: settings?.webChatWidgetConfig ?? null,
      portalConfig: settings?.portalConfig ?? null,
      smsProviderConfig: settings?.smsProviderConfig ?? null,
      smsProvider: fromNumber ? 'Twilio' : null,
      smsNumberMasked: fromNumber ? maskPhoneForDisplay(fromNumber) : null,
    })
  } catch (error) {
    console.error('[GET /api/settings/messaging]', error)
    return NextResponse.json({ error: 'Failed to load messaging settings' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only administrators can modify settings' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = messagingSettingsBody.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const current = await prisma.settings.findFirst()
    const payload = parsed.data

    const json = (value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined => {
      if (value === undefined) return undefined
      if (value === null) return Prisma.DbNull
      return value as Prisma.InputJsonValue
    }

    const currentPortal = (current?.portalConfig ?? {}) as Record<string, unknown>
    const mergedPortalConfig =
      payload.portalConfig !== undefined
        ? { ...currentPortal, ...payload.portalConfig }
        : undefined

    const updated = await prisma.settings.upsert({
      where: { id: current?.id ?? SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        messagingEnabled: payload.messagingEnabled ?? false,
        messagingBusinessHours: json(payload.messagingBusinessHours),
        defaultRoutingRules: json(payload.defaultRoutingRules),
        webChatWidgetConfig: json(payload.webChatWidgetConfig),
        portalConfig: json(mergedPortalConfig ?? payload.portalConfig),
        smsProviderConfig: json(payload.smsProviderConfig),
      },
      update: {
        ...(payload.messagingEnabled !== undefined
          ? { messagingEnabled: payload.messagingEnabled }
          : {}),
        ...(payload.messagingBusinessHours !== undefined
          ? { messagingBusinessHours: json(payload.messagingBusinessHours) }
          : {}),
        ...(payload.defaultRoutingRules !== undefined
          ? { defaultRoutingRules: json(payload.defaultRoutingRules) }
          : {}),
        ...(payload.webChatWidgetConfig !== undefined
          ? { webChatWidgetConfig: json(payload.webChatWidgetConfig) }
          : {}),
        ...(mergedPortalConfig !== undefined
          ? { portalConfig: json(mergedPortalConfig) }
          : {}),
        ...(payload.smsProviderConfig !== undefined
          ? { smsProviderConfig: json(payload.smsProviderConfig) }
          : {}),
      },
      select: {
        messagingEnabled: true,
        messagingBusinessHours: true,
        defaultRoutingRules: true,
        webChatWidgetConfig: true,
        portalConfig: true,
        smsProviderConfig: true,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[PUT /api/settings/messaging]', error)
    return NextResponse.json({ error: 'Failed to save messaging settings' }, { status: 500 })
  }
}
