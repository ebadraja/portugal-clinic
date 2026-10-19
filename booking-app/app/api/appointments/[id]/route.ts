import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@/lib/generated/prisma/client"
import prisma from "@/lib/prisma"
import { auth } from "@/auth"
import { requireStaff } from "@/lib/auth/guards"
import { rescheduleAppointment, setAppointmentStatus, updateAppointmentDetails } from "@/lib/appointments/booking"
import { bookingFailureResponse, staffActor } from "@/lib/appointments/http"
import { getClinicSettings, providerByName } from "@/lib/clinic/settings"
import { utcToZoned } from "@/lib/clinic/time"

type RouteContext = { params: Promise<{ id: string }> }

const PATIENT_SELECT = { firstName: true, lastName: true, phone: true }

// ── GET /api/appointments/[id] ────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
// Accepts any of: startTime, endTime, type, provider/providerId (moves — re-checked under the
// day lock), status (CONFIRMED/COMPLETED/NO_SHOW/CANCELLED…), reason, notes.
// All changes go through the booking service: history, audit and reminders follow.

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const guard = await requireStaff({ write: true })
    if (!guard.ok) return guard.response
    const { id } = await params
    const body = await req.json()
    const actor = staffActor(guard.user)

    const before = await prisma.appointment.findUnique({ where: { id } })
    if (!before) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
    }
    const settings = await getClinicSettings()

    // 1. Time / dentist / type / duration → reschedule
    const slotFields = ["startTime", "endTime", "type", "provider", "providerId"].filter((f) => f in body)
    if (slotFields.length > 0) {
      const start = "startTime" in body ? new Date(body.startTime) : before.startTime
      const end = "endTime" in body ? new Date(body.endTime) : new Date(start.getTime() + before.duration * 60_000)
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return NextResponse.json({ error: "Invalid startTime or endTime value" }, { status: 400 })
      }
      if (end <= start) return NextResponse.json({ error: "endTime must be after startTime" }, { status: 400 })
      const providerId = "providerId" in body
        ? body.providerId
        : "provider" in body
          ? providerByName(body.provider, settings.providers)?.id ?? null
          : undefined
      const z = utcToZoned(start, settings.timezone)
      const changed =
        start.getTime() !== before.startTime.getTime() ||
        end.getTime() !== before.endTime.getTime() ||
        (body.type !== undefined && body.type !== before.type) ||
        (providerId !== undefined && providerId !== before.providerId)
      if (changed) {
        const r = await rescheduleAppointment(
          id,
          {
            date: z.date,
            time: z.time,
            durationMinutes: Math.round((end.getTime() - start.getTime()) / 60_000),
            type: body.type,
            providerId,
            allowOverlap: body.allowOverlap === true,
            acknowledgeWarnings: body.acknowledgeWarnings ?? true,
            notifyPatient: body.notifyPatient !== false,
          },
          actor,
          { settings },
        )
        if (!r.ok) return bookingFailureResponse(r)
      }
    }

    // 2. Status
    if (typeof body.status === "string" && body.status !== before.status) {
      const r = await setAppointmentStatus(
        id,
        { status: body.status, reason: body.cancelReason ?? null, via: body.confirmedVia ?? null, notifyPatient: body.notifyPatient !== false, acknowledgeWarnings: body.acknowledgeWarnings ?? true, allowOverlap: body.allowOverlap === true },
        actor,
        { settings },
      )
      if (!r.ok) return bookingFailureResponse(r)
    }

    // 3. Free-text fields
    if ("reason" in body || "notes" in body) {
      const r = await updateAppointmentDetails(id, { ...("reason" in body && { reason: body.reason }), ...("notes" in body && { notes: body.notes }) }, actor)
      if (!r.ok) return bookingFailureResponse(r)
    }

    const after = await prisma.appointment.findUnique({ where: { id }, include: { patient: { select: PATIENT_SELECT } } })
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
// Soft-delete only: sets status → CANCELLED. Never hard-deletes.

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const guard = await requireStaff({ write: true })
    if (!guard.ok) return guard.response
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const r = await setAppointmentStatus(
      id,
      { status: "CANCELLED", reason: body.cancelReason ?? "Deleted by user", notifyPatient: body.notifyPatient !== false },
      staffActor(guard.user),
    )
    if (!r.ok) return bookingFailureResponse(r)
    return NextResponse.json({ message: "Appointment cancelled successfully" })
  } catch (error) {
    console.error("[DELETE /api/appointments/[id]]", error)
    return NextResponse.json({ error: "Failed to cancel appointment" }, { status: 500 })
  }
}
