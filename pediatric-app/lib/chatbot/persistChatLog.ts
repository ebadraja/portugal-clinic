import type { ChatOutcome, ChatTopic } from "@/lib/generated/prisma/client"
import prisma from "@/lib/prisma"

export type StoredChatMessage = {
  type: "bot" | "visitor"
  content: string
  timestamp: string
}

function inferTopic(text: string): ChatTopic {
  const t = text.toLowerCase()
  if (/\b(appointment|schedule|book|reschedule|cancel|visit|checkup|check-up|well.child)\b/.test(t)) return "APPOINTMENT"
  if (/\b(insurance|coverage|copay|co-pay|deductible|medicaid|medicare|tricare|billing|claim)\b/.test(t)) return "INSURANCE"
  if (/\b(price|cost|fee|charge|payment|pay|rate|afford)\b/.test(t)) return "PRICING"
  if (/\b(hours|open|close|closing|available|when|weekend|saturday|sunday)\b/.test(t)) return "HOURS"
  if (/\b(location|address|direction|where|map|park|find you|nearest)\b/.test(t)) return "LOCATION"
  if (/\b(service|treatment|doctor|physician|specialist|vaccine|immunization|sick|wellness|pediatric|developmental)\b/.test(t)) return "SERVICES"
  return "OTHER"
}

function inferOutcome(text: string, messageCount: number): ChatOutcome {
  const t = text.toLowerCase()
  if (/\b(booked|scheduled|confirmed|appointment.*set|set.*appointment)\b/.test(t)) return "BOOKED"
  if (/\b(transfer|escalat|speak with someone|connect you|human agent|call you back|nurse)\b/.test(t)) return "ESCALATED_TO_CALL"
  if (/\b(name.*phone|contact.*info|left.*details)\b/.test(t)) return "LEAD_CAPTURED"
  if (messageCount <= 2) return "IN_PROGRESS"
  return "INFO_PROVIDED"
}

function asMessages(raw: unknown): StoredChatMessage[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (m): m is StoredChatMessage =>
      typeof m === "object" &&
      m !== null &&
      (m as StoredChatMessage).type !== undefined &&
      typeof (m as StoredChatMessage).content === "string"
  )
}

async function notifyAdminsNewChat(chatLogId: string, preview: string) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  })
  if (!admins.length) return

  const snippet = preview.length > 120 ? `${preview.slice(0, 117)}...` : preview

  await prisma.$transaction(
    admins.map((admin) =>
      prisma.notification.create({
        data: {
          userId:    admin.id,
          type:      "chat_received",
          title:     "New GIGI Website Chat",
          message:   `Website visitor: ${snippet}`,
          icon:      "message",
          entityType: "chat_log",
          entityId:   chatLogId,
          actionUrl: "/chat-logs",
        },
      })
    )
  )
}

/** Upsert ChatLog for each website chat turn (Vapi Chat API does not fire voice webhooks). */
export async function persistWebsiteChatTurn(params: {
  sessionId: string
  userMessage: string
  botReply: string
  sourcePage?: string | null
  requestIp?: string | null
}): Promise<{ chatLogId: string; isNew: boolean }> {
  const now = new Date()
  const userEntry: StoredChatMessage = {
    type: "visitor",
    content: params.userMessage,
    timestamp: now.toISOString(),
  }
  const botEntry: StoredChatMessage = {
    type: "bot",
    content: params.botReply,
    timestamp: now.toISOString(),
  }

  const existing = await prisma.chatLog.findUnique({
    where: { sessionId: params.sessionId },
  })

  if (existing) {
    const messages = [...asMessages(existing.messages), userEntry, botEntry]
    const transcript = messages.map((m) => m.content).join(" ")

    await prisma.chatLog.update({
      where: { id: existing.id },
      data: {
        endTime: now,
        messageCount: messages.length,
        messages,
        topic: inferTopic(transcript),
        outcome: inferOutcome(transcript, messages.length),
        appointmentBooked: /\b(booked|scheduled|confirmed)\b/i.test(transcript),
        sourcePage: existing.sourcePage ?? params.sourcePage ?? "GIGI Website Chatbot",
      },
    })

    return { chatLogId: existing.id, isNew: false }
  }

  const messages = [userEntry, botEntry]
  const transcript = `${params.userMessage} ${params.botReply}`

  const chatLog = await prisma.chatLog.create({
    data: {
      sessionId: params.sessionId,
      startTime: now,
      endTime: now,
      messageCount: messages.length,
      messages,
      topic: inferTopic(transcript),
      outcome: "IN_PROGRESS",
      sourcePage: params.sourcePage ?? "GIGI Website Chatbot",
      deviceType: "Website",
      summary: null,
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: null,
      action: "CREATE",
      entity: "chat_log",
      entityId: chatLog.id,
      changes: { source: "gigi_website_chatbot", sessionId: params.sessionId },
      ipAddress: params.requestIp,
      userAgent: "GIGI-Website-Chatbot",
      timestamp: now,
    },
  })

  await notifyAdminsNewChat(chatLog.id, params.userMessage)

  return { chatLogId: chatLog.id, isNew: true }
}
