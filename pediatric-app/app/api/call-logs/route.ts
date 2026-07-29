import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@/lib/generated/prisma/client"
import prisma from "@/lib/prisma"
import { auth } from "@/auth"

// ── GET /api/call-logs ────────────────────────────────────────────────────────
// Filters: search (transcript/callerName), intent, outcome, dateFrom, dateTo,
//          isReviewed, patientId, page, limit (default 20)
// Ordered by startTime descending. Includes patient firstName, lastName.
// HIPAA: audit log every read that returns transcript data.

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    const { searchParams } = request.nextUrl

    const page  = Math.max(1, parseInt(searchParams.get("page")  ?? "1",  10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)))

    const search     = searchParams.get("search")
    const intent     = searchParams.get("intent")
    const outcome    = searchParams.get("outcome")
    const dateFrom   = searchParams.get("dateFrom")
    const dateTo     = searchParams.get("dateTo")
    const isReviewed = searchParams.get("isReviewed")
    const patientId  = searchParams.get("patientId")

    const where: Prisma.CallLogWhereInput = {}

    if (search) {
      where.OR = [
        { transcript: { contains: search, mode: "insensitive" } },
        { callerName: { contains: search, mode: "insensitive" } },
        { summary:    { contains: search, mode: "insensitive" } },
      ]
    }

    if (intent)    where.intent  = intent  as Prisma.EnumCallIntentFilter["equals"]
    if (outcome)   where.outcome = outcome as Prisma.EnumCallOutcomeFilter["equals"]
    if (patientId) where.patientId = patientId

    if (isReviewed !== null && isReviewed !== undefined) {
      where.isReviewed = isReviewed === "true"
    }

    if (dateFrom || dateTo) {
      where.startTime = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo   && { lte: new Date(dateTo)   }),
      }
    }

    const [callLogs, total] = await Promise.all([
      prisma.callLog.findMany({
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
      prisma.callLog.count({ where }),
    ])

    // HIPAA: audit every read that exposes transcripts (fire-and-forget)
    prisma.auditLog.create({
      data: {
        userId:    session?.user?.id ?? null,
        action:    "READ",
        entity:    "call_log",
        changes:   { filters: { search, intent, outcome, patientId, isReviewed, dateFrom, dateTo } },
        ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? null,
        userAgent: request.headers.get("user-agent") ?? null,
        timestamp: new Date(),
      },
    }).catch(() => {})

    return NextResponse.json({
      data: callLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("[GET /api/call-logs]", error)
    return NextResponse.json({ error: "Failed to fetch call logs" }, { status: 500 })
  }
}

// ── POST /api/call-logs ───────────────────────────────────────────────────────
// Required: callerPhone, startTime
// Optional: callerName, endTime, duration, intent, outcome, sentiment,
//           transcript, summary, recordingUrl, vapiCallId, wasEscalated,
//           escalationReason, transferredTo, appointmentBooked, appointmentId,
//           patientId
// Auto-lookup: if callerPhone matches a patient's phone, link patientId.

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    const body = await request.json()

    const { callerPhone, startTime } = body

    if (!callerPhone || !startTime) {
      return NextResponse.json(
        { error: "Missing required fields: callerPhone, startTime" },
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

    // Auto-link patient by phone if not explicitly provided
    let resolvedPatientId: string | null = body.patientId ?? null
    if (!resolvedPatientId && callerPhone) {
      const matched = await prisma.patient.findFirst({
        where: { phone: callerPhone },
        select: { id: true },
      })
      if (matched) resolvedPatientId = matched.id
    }

    const callLog = await prisma.callLog.create({
      data: {
        callerPhone,
        startTime:       start,
        endTime:         end ?? null,
        duration:        body.duration         ?? null,
        callerName:      body.callerName       ?? null,
        intent:          body.intent           ?? "GENERAL",
        outcome:         body.outcome          ?? "IN_PROGRESS",
        sentiment:       body.sentiment        ?? "NEUTRAL",
        transcript:      body.transcript       ?? null,
        summary:         body.summary          ?? null,
        recordingUrl:    body.recordingUrl     ?? null,
        vapiCallId:      body.vapiCallId       ?? null,
        wasEscalated:    body.wasEscalated     ?? false,
        escalationReason: body.escalationReason ?? null,
        transferredTo:   body.transferredTo    ?? null,
        appointmentBooked: body.appointmentBooked ?? false,
        appointmentId:   body.appointmentId    ?? null,
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
        entity:    "call_log",
        entityId:  callLog.id,
        changes:   {
          vapiCallId:   body.vapiCallId  ?? null,
          patientId:    resolvedPatientId,
          autoLinked:   !body.patientId && !!resolvedPatientId,
        },
        ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? null,
        userAgent: request.headers.get("user-agent") ?? null,
        timestamp: new Date(),
      },
    })

    return NextResponse.json(callLog, { status: 201 })
  } catch (error) {
    console.error("[POST /api/call-logs]", error)
    return NextResponse.json({ error: "Failed to create call log" }, { status: 500 })
  }
}
