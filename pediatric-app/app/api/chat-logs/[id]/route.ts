import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@/lib/generated/prisma/client"
import prisma from "@/lib/prisma"
import { auth } from "@/auth"

type RouteContext = { params: Promise<{ id: string }> }

// ── GET /api/chat-logs/[id] ───────────────────────────────────────────────────
// Returns full chat log including messages (Json), patient details, and linked
// appointment if any. HIPAA: every single-record read is audited.

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth()
    const { id }  = await params

    const chatLog = await prisma.chatLog.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id:          true,
            firstName:   true,
            lastName:    true,
            dateOfBirth: true,
            phone:       true,
            email:       true,
          },
        },
        appointment: {
          select: {
            id:        true,
            startTime: true,
            endTime:   true,
            type:      true,
            status:    true,
            provider:  true,
            reason:    true,
          },
        },
      },
    })

    if (!chatLog) {
      return NextResponse.json({ error: "Chat log not found" }, { status: 404 })
    }

    // HIPAA: audit every read that exposes conversation content
    prisma.auditLog.create({
      data: {
        userId:    session?.user?.id ?? null,
        action:    "READ",
        entity:    "chat_log",
        entityId:  id,
        changes:   { messageCount: chatLog.messageCount, hasMessages: chatLog.messageCount > 0 },
        ipAddress: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null,
        userAgent: req.headers.get("user-agent") ?? null,
        timestamp: new Date(),
      },
    }).catch(() => {})

    return NextResponse.json(chatLog)
  } catch (error) {
    console.error("[GET /api/chat-logs/[id]]", error)
    return NextResponse.json({ error: "Failed to fetch chat log" }, { status: 500 })
  }
}

// ── PATCH /api/chat-logs/[id] ─────────────────────────────────────────────────
// Staff-editable fields: isReviewed, leadCaptured, summary, outcome.
// Allows staff to mark a session reviewed, flag a lead, correct outcome, or
// add a manual summary note. All other fields are owned by the chatbot.

const PATCHABLE = ["isReviewed", "leadCaptured", "summary", "outcome"] as const
type PatchableField = (typeof PATCHABLE)[number]

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth()
    const { id }  = await params
    const body     = await req.json()

    const unknownFields = Object.keys(body).filter(
      (k) => !(PATCHABLE as readonly string[]).includes(k)
    )
    if (unknownFields.length) {
      return NextResponse.json(
        { error: `Fields are not editable: ${unknownFields.join(", ")}` },
        { status: 400 }
      )
    }

    const patchedFields = PATCHABLE.filter((f) => f in body)
    if (patchedFields.length === 0) {
      return NextResponse.json(
        { error: `No patchable fields provided. Allowed: ${PATCHABLE.join(", ")}` },
        { status: 400 }
      )
    }

    if ("outcome" in body) {
      const validOutcomes = ["IN_PROGRESS", "BOOKED", "INFO_PROVIDED", "ESCALATED_TO_CALL", "LEAD_CAPTURED", "ABANDONED"]
      if (!validOutcomes.includes(body.outcome)) {
        return NextResponse.json(
          { error: `Invalid outcome. Must be one of: ${validOutcomes.join(", ")}` },
          { status: 400 }
        )
      }
    }

    const before = await prisma.chatLog.findUnique({ where: { id } })
    if (!before) {
      return NextResponse.json({ error: "Chat log not found" }, { status: 404 })
    }

    const data: Prisma.ChatLogUpdateInput = {}
    for (const field of patchedFields) {
      (data as Record<PatchableField, unknown>)[field] = body[field]
    }

    const after = await prisma.chatLog.update({
      where: { id },
      data,
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    })

    const changedFields = patchedFields.filter(
      (f) => String(before[f]) !== String(body[f])
    )

    const reviewMeta =
      "isReviewed" in body && body.isReviewed === true && !before.isReviewed
        ? { reviewedBy: session?.user?.id ?? "unknown", reviewedAt: new Date().toISOString() }
        : undefined

    await prisma.auditLog.create({
      data: {
        userId:    session?.user?.id ?? null,
        action:    "UPDATE",
        entity:    "chat_log",
        entityId:  id,
        changes:   {
          before:  Object.fromEntries(changedFields.map((f) => [f, before[f]])),
          after:   Object.fromEntries(changedFields.map((f) => [f, after[f]])),
          ...(reviewMeta && { review: reviewMeta }),
        },
        ipAddress: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null,
        userAgent: req.headers.get("user-agent") ?? null,
        timestamp: new Date(),
      },
    })

    return NextResponse.json(after)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Chat log not found" }, { status: 404 })
    }
    console.error("[PATCH /api/chat-logs/[id]]", error)
    return NextResponse.json({ error: "Failed to update chat log" }, { status: 500 })
  }
}

// ── DELETE intentionally omitted ──────────────────────────────────────────────
// Chat logs retained per HIPAA 45 CFR §164 minimum 6-year retention rule.
