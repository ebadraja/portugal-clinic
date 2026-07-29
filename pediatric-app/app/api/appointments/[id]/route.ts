import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@/lib/generated/prisma/client"
import prisma from "@/lib/prisma"
import { auth } from "@/auth"

type RouteContext = { params: Promise<{ id: string }> }

const PATIENT_SELECT = { firstName: true, lastName: true, phone: true }

// ── GET /api/appointments/[id] ────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth()
    const { id } = await params

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { patient: { select: PATIENT_SELECT } },
    })

    if (!appointment) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
    }

    // HIPAA audit
    prisma.auditLog.create({
      data: {
        userId:    session?.user?.id ?? null,
        action:    "READ",
        entity:    "appointment",
        entityId:  id,
        timestamp: new Date(),
      },
    }).catch(() => {})

    return NextResponse.json(appointment)
  } catch (error) {
    console.error("[GET /api/appointments/[id]]", error)
    return NextResponse.json({ error: "Failed to fetch appointment" }, { status: 500 })
  }
}

// ── PUT /api/appointments/[id] ────────────────────────────────────────────────

const UPDATABLE = [
  "startTime", "endTime", "type", "status",
  "provider", "reason", "notes",
] as const

type UpdatableField = (typeof UPDATABLE)[number]

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth()
    const { id }  = await params
    const body     = await req.json()

    // Fetch current state for audit diff + status-change logic
    const before = await prisma.appointment.findUnique({ where: { id } })
    if (!before) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
    }

    const data: Prisma.AppointmentUpdateInput = {}

    for (const field of UPDATABLE) {
      if (!(field in body)) continue

      if (field === "startTime" || field === "endTime") {
        const parsed = new Date(body[field])
        if (isNaN(parsed.getTime())) {
          return NextResponse.json({ error: `Invalid ${field} value` }, { status: 400 })
        }
        data[field] = parsed
      } else {
        (data as Record<UpdatableField, unknown>)[field] = body[field]
      }
    }

    const newStatus = body.status as string | undefined

    // Handle CANCELLED status change
    if (newStatus === "CANCELLED" && before.status !== "CANCELLED") {
      data.cancelledAt  = new Date()
      data.cancelReason = body.cancelReason ?? "Appointment cancelled"
    }

    const after = await prisma.appointment.update({
      where: { id },
      data,
      include: { patient: { select: PATIENT_SELECT } },
    })

    // Handle COMPLETED status change — update patient visit stats
    if (newStatus === "COMPLETED" && before.status !== "COMPLETED") {
      await prisma.patient.update({
        where: { id: after.patientId },
        data: {
          totalVisits: { increment: 1 },
          lastVisitAt: after.startTime,
        },
      })
    }

    // HIPAA audit — record before/after diff for changed fields
    const changedFields = UPDATABLE.filter(
      (f) => f in body && String(before[f]) !== String(body[f])
    )
    const changes = changedFields.length
      ? {
          before: Object.fromEntries(changedFields.map((f) => [f, before[f]])),
          after:  Object.fromEntries(changedFields.map((f) => [f, after[f]])),
        }
      : undefined

    await prisma.auditLog.create({
      data: {
        userId:    session?.user?.id ?? null,
        action:    "UPDATE",
        entity:    "appointment",
        entityId:  id,
        changes:   changes ?? Prisma.JsonNull,
        timestamp: new Date(),
      },
    })

    return NextResponse.json(after)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
    }
    console.error("[PUT /api/appointments/[id]]", error)
    return NextResponse.json({ error: "Failed to update appointment" }, { status: 500 })
  }
}

// ── DELETE /api/appointments/[id] ─────────────────────────────────────────────
// Soft-delete only: sets status → CANCELLED. Never hard-deletes (HIPAA).

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth()
    const { id }  = await params

    const before = await prisma.appointment.findUnique({ where: { id } })
    if (!before) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
    }

    const body         = await req.json().catch(() => ({}))
    const cancelReason = body.cancelReason ?? "Deleted by user"

    await prisma.appointment.update({
      where: { id },
      data: {
        status:      "CANCELLED",
        cancelledAt: new Date(),
        cancelReason,
      },
    })

    // HIPAA audit
    await prisma.auditLog.create({
      data: {
        userId:    session?.user?.id ?? null,
        action:    "DELETE",
        entity:    "appointment",
        entityId:  id,
        changes:   { before: { status: before.status }, after: { status: "CANCELLED", cancelReason } },
        timestamp: new Date(),
      },
    })

    return NextResponse.json({ message: "Appointment cancelled successfully" })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
    }
    console.error("[DELETE /api/appointments/[id]]", error)
    return NextResponse.json({ error: "Failed to cancel appointment" }, { status: 500 })
  }
}
