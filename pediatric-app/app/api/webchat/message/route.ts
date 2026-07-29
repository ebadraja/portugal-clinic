import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import {
  encryptMessageContent,
  previewText,
} from '@/lib/messaging/serialize'
import { resolveWebChatPatient } from '@/lib/messaging/patientMatcher'
import { getOrCreatePatientConversation } from '@/lib/messaging/portalAuth'
import { webchatMessageBody } from '@/lib/messaging/webchatSchemas'
import {
  resolveWebchatSession,
  setWebchatSessionCookie,
} from '@/lib/messaging/webchatSession'
import { normalizePhone, phonesMatch } from '@/lib/messaging/portalAuth'
import { isWithinBusinessHours } from '@/lib/messaging/businessHours'
import { notifyStaffNewMessage } from '@/lib/messaging/notifications'
import {
  chatbotJsonResponse,
  handleChatbotPreflight,
  withChatbotCors,
} from '@/lib/chatbot/cors'

export const dynamic = 'force-dynamic'

const WEBCHAT_CORS = { credentials: true as const }

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 20
const recentPosts = new Map<string, number[]>()

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const hits = (recentPosts.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (hits.length >= RATE_LIMIT_MAX) return true
  hits.push(now)
  recentPosts.set(key, hits)
  return false
}

export async function OPTIONS(request: NextRequest) {
  return handleChatbotPreflight(request, WEBCHAT_CORS) ?? new NextResponse(null, { status: 405 })
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const session = await resolveWebchatSession(request)
    if (!session) {
      return chatbotJsonResponse({ messages: [], conversationId: null }, origin, undefined, WEBCHAT_CORS)
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: session.conversationId },
      include: {
        patient: { select: { phone: true, parentPhone: true } },
      },
    })

    if (!conversation) {
      return chatbotJsonResponse({ messages: [], conversationId: null }, origin, undefined, WEBCHAT_CORS)
    }

    const patientPhones = [
      conversation.patient.phone,
      conversation.patient.parentPhone,
    ].filter((p): p is string => Boolean(p))

    const phoneMatches = patientPhones.some((p) => phonesMatch(p, session.phone))
    if (!phoneMatches) {
      return chatbotJsonResponse({ error: 'Session mismatch' }, origin, { status: 403 }, WEBCHAT_CORS)
    }

    const messages = await prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        isInternalNote: false,
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    })

    return chatbotJsonResponse(
      {
        conversationId: conversation.id,
        messages: messages.map((m) => ({
          id: m.id,
          senderType: m.senderType,
          channel: m.channel,
          content: decrypt(m.content),
          createdAt: m.createdAt,
        })),
      },
      origin,
      undefined,
      WEBCHAT_CORS,
    )
  } catch (error) {
    console.error('[GET /api/webchat/message]', error)
    return chatbotJsonResponse({ error: 'Failed to load messages' }, origin, { status: 500 }, WEBCHAT_CORS)
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    if (isRateLimited(ip)) {
      return chatbotJsonResponse(
        { error: 'Too many requests. Please wait a moment.' },
        origin,
        { status: 429 },
        WEBCHAT_CORS,
      )
    }

    const body = await request.json()
    const parsed = webchatMessageBody.safeParse(body)
    if (!parsed.success) {
      return chatbotJsonResponse(
        { error: 'Invalid request', details: parsed.error.flatten() },
        origin,
        { status: 400 },
        WEBCHAT_CORS,
      )
    }

    const { visitorName, phone, reason, content } = parsed.data
    const phoneKey = normalizePhone(phone)
    if (isRateLimited(`phone:${phoneKey}`)) {
      return chatbotJsonResponse(
        { error: 'Too many messages from this number.' },
        origin,
        { status: 429 },
        WEBCHAT_CORS,
      )
    }

    const settings = await prisma.settings.findFirst({
      select: { messagingBusinessHours: true, webChatWidgetConfig: true },
    })
    const widget = (settings?.webChatWidgetConfig ?? {}) as { enabled?: boolean }
    if (widget.enabled === false) {
      return chatbotJsonResponse(
        { error: 'Messaging is temporarily unavailable.' },
        origin,
        { status: 503 },
        WEBCHAT_CORS,
      )
    }

    const online = isWithinBusinessHours(settings?.messagingBusinessHours as never)
    // Offline mode still accepts messages per requirements

    const { patientId } = await resolveWebChatPatient(visitorName, phone)
    let conversation = await prisma.conversation.findUnique({ where: { patientId } })
    if (!conversation) {
      conversation = await getOrCreatePatientConversation(patientId, reason)
    } else if (reason && !conversation.reason) {
      const { resolveInboxForReason } = await import('@/lib/messaging/router')
      const assignedInboxId = await resolveInboxForReason(reason)
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { reason, assignedInboxId },
      })
    }

    const now = new Date()
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId: conversation!.id,
          senderType: 'PATIENT',
          channel: 'WEB_CHAT',
          content: encryptMessageContent(content),
          contentType: 'TEXT',
          deliveryStatus: 'DELIVERED',
          metadata: {
            visitorName,
            source: 'webchat-widget',
            offlineSubmission: !online,
          },
        },
      })

      await tx.conversation.update({
        where: { id: conversation!.id },
        data: {
          status: 'OPEN',
          lastMessageAt: now,
          lastMessagePreview: previewText(content),
          unreadCount: { increment: 1 },
        },
      })

      return created
    })

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { firstName: true, lastName: true },
    })

    void notifyStaffNewMessage({
      conversationId: conversation!.id,
      patientFirstName: patient?.firstName ?? visitorName.split(' ')[0] ?? 'Web',
      patientLastName: patient?.lastName ?? 'Chat Visitor',
      preview: previewText(content),
      assignedToId: conversation!.assignedToId,
    }).catch((err) => console.error('[webchat] new message notification failed:', err))

    const sessionToken = await setWebchatSessionCookie(conversation!.id, phoneKey)

    return withChatbotCors(
      NextResponse.json(
        {
          id: message.id,
          conversationId: conversation!.id,
          sessionToken,
          senderType: message.senderType,
          channel: message.channel,
          content,
          createdAt: message.createdAt,
          isOnline: online,
        },
        { status: 201 },
      ),
      origin,
      WEBCHAT_CORS,
    )
  } catch (error) {
    console.error('[POST /api/webchat/message]', error)
    return chatbotJsonResponse({ error: 'Failed to send message' }, origin, { status: 500 }, WEBCHAT_CORS)
  }
}
