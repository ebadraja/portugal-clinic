import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@/lib/generated/prisma/client"
import prisma from "@/lib/prisma"
import { auth } from "@/auth"

// ── GET /api/chat-logs ────────────────────────────────────────────────────────
// Filters: topic, outcome, dateFrom, dateTo, sourcePage, patientId, page, limit
// Ordered by startTime descending. Includes patient firstName, lastName.

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    const { searchParams } = request.nextUrl

    const page  = Math.max(1, parseInt(searchParams.get("page")  ?? "1",  10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)))

    const search     = searchParams.get("search")
    const topic      = searchParams.get("topic")
    const outcome    = searchParams.get("outcome")
    const dateFrom   = searchParams.get("dateFrom")
    const dateTo     = searchParams.get("dateTo")
    const sourcePage = searchParams.get("sourcePage")
    const patientId  = searchParams.get("patientId")
    const isReviewed = searchParams.get("isReviewed")

    const where: Prisma.ChatLogWhereInput = {}

    if (search) {
      where.OR = [
        { visitorName:  { contains: search, mode: "insensitive" } },
        { visitorEmail: { contains: search, mode: "insensitive" } },
        { summary:      { contains: search, mode: "insensitive" } },
      ]
    }

    if (topic)      where.topic      = topic      as Prisma.EnumChatTopicFilter["equals"]
    if (outcome)    where.outcome    = outcome    as Prisma.EnumChatOutcomeFilter["equals"]
    if (patientId)  where.patientId  = patientId
    if (sourcePage) where.sourcePage = { contains: sourcePage, mode: "insensitive" }

    if (isReviewed !== null && isReviewed !== undefined) {
      where.isReviewed = isReviewed === "true"
    }

    if (dateFrom || dateTo) {
      where.startTime = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo   && { lte: new Date(dateTo)   }),
      }
    }

    const [chatLogs, total] = await Promise.all([
      prisma.chatLog.findMany({
        where,
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: { startTime: "desc" },
        include: {
          patient: {
            select: { firstName: true, lastName: true },
          },
        },
      }),
      prisma.chatLog.count({ where }),
    ])

    // HIPAA: audit list reads (fire-and-forget)
    prisma.auditLog.create({
      data: {
        userId:    session?.user?.id ?? null,
        action:    "READ",
        entity:    "chat_log",
        changes:   { filters: { topic, outcome, patientId, sourcePage, isReviewed, dateFrom, dateTo } },
        ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? null,
        userAgent: request.headers.get("user-agent") ?? null,
        timestamp: new Date(),
      },
    }).catch(() => {})

    return NextResponse.json({
      data: chatLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("[GET /api/chat-logs]", error)
    return NextResponse.json({ error: "Failed to fetch chat logs" }, { status: 500 })
  }
}

// ── POST /api/chat-logs ───────────────────────────────────────────────────────
// Required: sessionId, startTime
// Optional: visitorName, visitorEmail, visitorPhone, endTime, messageCount,
//           topic, outcome, messages (Json), summary, sourcePage, deviceType,
//           browser, leadCaptured, leadInfo, appointmentBooked, appointmentId,
//           patientId
// Auto-link: if patientId not provided, match visitor phone then email against
//            existing patients.

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    const body = await request.json()

    const { sessionId, startTime } = body

    if (!sessionId || !startTime) {
      return NextResponse.json(
        { error: "Missing required fields: sessionId, startTime" },
        { status: 400 }
      )
    }

    const start = new Date(startTime)
    if (isNaN(start.getTime())) {
      return NextResponse.json({ error: "Invalid startTime" }, { status: 400 })
    }

    const end = body.endTime ? new Date(body.endTime) : undefined
    if (end && isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid endTime" }, { status: 400 })
    }

    // Guard against duplicate sessionId (Vapi/chatbot may retry webhooks)
    const existing = await prisma.chatLog.findUnique({
      where:  { sessionId },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json(
        { error: "A chat log with this sessionId already exists", existingId: existing.id },
        { status: 409 }
      )
    }

    // Auto-link patient — phone first (more specific), then email
    let resolvedPatientId: string | null = body.patientId ?? null
    let autoLinkMethod: string | null = null

    if (!resolvedPatientId) {
      if (body.visitorPhone) {
        const byPhone = await prisma.patient.findFirst({
          where:  { phone: body.visitorPhone },
          select: { id: true },
        })
        if (byPhone) { resolvedPatientId = byPhone.id; autoLinkMethod = "phone" }
      }

      if (!resolvedPatientId && body.visitorEmail) {
        const byEmail = await prisma.patient.findFirst({
          where:  { email: { equals: body.visitorEmail, mode: "insensitive" } },
          select: { id: true },
        })
        if (byEmail) { resolvedPatientId = byEmail.id; autoLinkMethod = "email" }
      }
    }

    const chatLog = await prisma.chatLog.create({
      data: {
        sessionId,
        startTime:       start,
        endTime:         end                       ?? null,
        messageCount:    body.messageCount         ?? 0,
        visitorName:     body.visitorName          ?? null,
        visitorEmail:    body.visitorEmail         ?? null,
        visitorPhone:    body.visitorPhone         ?? null,
        topic:           body.topic                ?? "OTHER",
        outcome:         body.outcome              ?? "IN_PROGRESS",
        messages:        body.messages             ?? [],
        summary:         body.summary              ?? null,
        sourcePage:      body.sourcePage           ?? null,
        deviceType:      body.deviceType           ?? null,
        browser:         body.browser              ?? null,
        leadCaptured:    body.leadCaptured         ?? false,
        leadInfo:        body.leadInfo             ?? null,
        appointmentBooked: body.appointmentBooked  ?? false,
        appointmentId:   body.appointmentId        ?? null,
        patientId:       resolvedPatientId,
      },
      include: {
        patient: {
          select: { firstName: true, lastName: true },
        },
      },
    })

    // HIPAA audit log
    await prisma.auditLog.create({
      data: {
        userId:    session?.user?.id ?? null,
        action:    "CREATE",
        entity:    "chat_log",
        entityId:  chatLog.id,
        changes:   {
          sessionId,
          patientId:    resolvedPatientId,
          autoLinked:   !body.patientId && !!resolvedPatientId,
          autoLinkMethod,
        },
        ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? null,
        userAgent: request.headers.get("user-agent") ?? null,
        timestamp: new Date(),
      },
    })

    return NextResponse.json(chatLog, { status: 201 })
  } catch (error) {
    console.error("[POST /api/chat-logs]", error)
    return NextResponse.json({ error: "Failed to create chat log" }, { status: 500 })
  }
}
