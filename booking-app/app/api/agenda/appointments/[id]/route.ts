import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { requireStaff } from "@/lib/auth/guards"
import { APPOINTMENT_TYPE_KEYS, getClinicSettings } from "@/lib/clinic/settings"
import { rescheduleAppointment, setAppointmentStatus, setCheckedIn, updateAppointmentDetails } from "@/lib/appointments/booking"
import { bookingFailureResponse, staffActor } from "@/lib/appointments/http"
import { loadAppointmentDetail } from "@/lib/appointments/agenda"
import { markWaitlistBooked } from "@/lib/appointments/waitlist"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

// ── GET /api/agenda/appointments/[id] — the detail drawer ─────────────────────

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const { id } = await params
  try {
    const detail = await loadAppointmentDetail(id, await getClinicSettings())
    if (!detail) return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
    prisma.auditLog
      .create({ data: { userId: guard.user.id, action: "READ", entity: "appointment", entityId: id, timestamp: new Date() } })
      .catch(() => {})
    return NextResponse.json(detail)
  } catch (error) {
    console.error("[GET /api/agenda/appointments/[id]]", error)
    return NextResponse.json({ error: "Failed to load the appointment" }, { status: 500 })
  }
}

const Common = { acknowledgeWarnings: z.boolean().optional(), allowOverlap: z.boolean().optional(), notifyPatient: z.boolean().optional() }

const PatchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("move"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    durationMinutes: z.number().int().min(5).max(720).optional(),
    providerId: z.string().max(60).nullable().optional(),
    type: z.enum(APPOINTMENT_TYPE_KEYS).optional(),
    waitlistEntryId: z.string().max(60).optional(),
    ...Common,
  }),
  z.object({
    action: z.literal("status"),
    status: z.enum(["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]),
    reason: z.string().trim().max(300).nullable().optional(),
    via: z.string().trim().max(30).nullable().optional(),
    ...Common,
  }),
  z.object({ action: z.literal("checkin"), arrived: z.boolean() }),
  z.object({
    action: z.literal("details"),
    reason: z.string().trim().max(300).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  }),
])

// ── PATCH /api/agenda/appointments/[id] ───────────────────────────────────────
// { action: "move" | "status" | "checkin" | "details", … } — same status codes as POST.

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const guard = await requireStaff({ write: true })
  if (!guard.ok) return guard.response
  const { id } = await params
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: `${issue?.path.join(".") || "body"}: ${issue?.message ?? "invalid"}` }, { status: 400 })
  }
  const body = parsed.data
  const actor = staffActor(guard.user)
  try {
    const r =
      body.action === "move"
        ? await rescheduleAppointment(id, body, actor)
        : body.action === "status"
          ? await setAppointmentStatus(id, body, actor)
          : body.action === "checkin"
            ? await setCheckedIn(id, body.arrived, actor)
            : await updateAppointmentDetails(id, { reason: body.reason, notes: body.notes }, actor)
    if (!r.ok) return bookingFailureResponse(r)
    if (body.action === "move" && body.waitlistEntryId) await markWaitlistBooked(body.waitlistEntryId, id)
    return NextResponse.json({ id, warnings: r.warnings })
  } catch (error) {
    console.error("[PATCH /api/agenda/appointments/[id]]", error)
    return NextResponse.json({ error: "Failed to update the appointment" }, { status: 500 })
  }
}
