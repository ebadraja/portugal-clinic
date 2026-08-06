import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@/lib/generated/prisma/client"
import prisma from "@/lib/prisma"
import { auth } from "@/auth"

type RouteContext = { params: Promise<{ id: string }> }

// ── GET /api/call-logs/[id] ───────────────────────────────────────────────────
// Returns full call log including transcript, patient details, and linked
// appointment. HIPAA: every single-record read is audited with IP + UA.

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth()
    const { id }  = await params

    const callLog = await prisma.callLog.findUnique({
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

    if (!callLog) {
      return NextResponse.json({ error: "Call log not found" }, { status: 404 })
    }

    // HIPAA: audit every read of a record containing a transcript
    prisma.auditLog.create({
      data: {
        userId:    session?.user?.id ?? null,
        action:    "READ",
        entity:    "call_log",
        entityId:  id,
        changes:   { hasTranscript: !!callLog.transcript },
        ipAddress: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null,
        userAgent: req.headers.get("user-agent") ?? null,
        timestamp: new Date(),
      },
    }).catch(() => {})

    return NextResponse.json(callLog)
  } catch (error) {
    console.error("[GET /api/call-logs/[id]]", error)
    return NextResponse.json({ error: "Failed to fetch call log" }, { status: 500 })
  }
}

// ── PATCH /api/call-logs/[id] ─────────────────────────────────────────────────
// Staff-editable fields only: isReviewed, flagForFollowUp, summary.
// Marking isReviewed=true records the reviewing user's id and timestamp.
// All other fields are immutable after creation (voice agent owns them).

const PATCHABLE = ["isReviewed", "flagForFollowUp", "summary"] as const
type PatchableField = (typeof PATCHABLE)[number]

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth()
    const { id }  = await params
    const body     = await req.json()

    // Reject any attempt to modify non-patchable fields
    const unknownFields = Object.keys(body).filter(
      (k) => !(PATCHABLE as readonly string[]).includes(k)
    )
    if (unknownFields.length) {
      return NextResponse.json(
        { error: `Fields are not editable: ${unknownFields.join(", ")}` },
        { status: 400 }
      )
    }

    // Must send at least one recognised field
    const patchedFields = PATCHABLE.filter((f) => f in body)
    if (patchedFields.length === 0) {
      return NextResponse.json(
        { error: `No patchable fields provided. Allowed: ${PATCHABLE.join(", ")}` },
        { status: 400 }
      )
    }

    const before = await prisma.callLog.findUnique({ where: { id } })
    if (!before) {
      return NextResponse.json({ error: "Call log not found" }, { status: 404 })
    }

    const data: Prisma.CallLogUpdateInput = {}
    for (const field of patchedFields) {
      (data as Record<PatchableField, unknown>)[field] = body[field]
    }

    const after = await prisma.callLog.update({
      where: { id },
      data,
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    })

    // Build before/after diff for fields that actually changed value
    const changedFields = patchedFields.filter(
      (f) => String(before[f]) !== String(body[f])
    )

    // When isReviewed flips to true, record the reviewer explicitly
    const reviewMeta =
      "isReviewed" in body && body.isReviewed === true && !before.isReviewed
        ? { reviewedBy: session?.user?.id ?? "unknown", reviewedAt: new Date().toISOString() }
        : undefined

    await prisma.auditLog.create({
      data: {
        userId:    session?.user?.id ?? null,
        action:    "UPDATE",
        entity:    "call_log",
        entityId:  id,
        changes:   {
          before:     Object.fromEntries(changedFields.map((f) => [f, before[f]])),
          after:      Object.fromEntries(changedFields.map((f) => [f, after[f]])),
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
      return NextResponse.json({ error: "Call log not found" }, { status: 404 })
    }
    console.error("[PATCH /api/call-logs/[id]]", error)
    return NextResponse.json({ error: "Failed to update call log" }, { status: 500 })
  }
}

// ── DELETE is intentionally omitted ──────────────────────────────────────────
// Call logs must be retained for a minimum of 6 years under HIPAA 45 CFR §164.
// Any 405 from this endpoint is the correct response.
