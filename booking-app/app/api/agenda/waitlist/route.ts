import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { requestMeta, requireStaff } from "@/lib/auth/guards"
import { APPOINTMENT_TYPE_KEYS, getClinicSettings } from "@/lib/clinic/settings"
import { TIMES_OF_DAY, listWaitlist, upsertWaitlistEntry, waitlistMatches } from "@/lib/appointments/waitlist"

export const dynamic = "force-dynamic"

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

// ── GET /api/agenda/waitlist ──────────────────────────────────────────────────
// Active entries, oldest first. With ?date=&time=&duration=[&providerId=] only the
// entries that fit that free slot ("who could take this time?").

export async function GET(request: NextRequest) {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const sp = request.nextUrl.searchParams
  try {
    const settings = await getClinicSettings()
    const date = sp.get("date")
    const time = sp.get("time")
    if (date || time) {
      if (!date || !DATE.test(date) || !time || !TIME.test(time)) return NextResponse.json({ error: "date and time are required" }, { status: 400 })
      const duration = Math.min(720, Math.max(5, parseInt(sp.get("duration") ?? "30", 10) || 30))
      const entries = await waitlistMatches({ date, time, durationMinutes: duration, providerId: sp.get("providerId") || null }, settings)
      return NextResponse.json({ entries })
    }
    return NextResponse.json({ entries: await listWaitlist(settings, { patientId: sp.get("patientId") || undefined }) })
  } catch (error) {
    console.error("[GET /api/agenda/waitlist]", error)
    return NextResponse.json({ error: "Failed to load the waiting list" }, { status: 500 })
  }
}

const CreateSchema = z.object({
  patientId: z.string().min(1).max(60),
  type: z.enum(APPOINTMENT_TYPE_KEYS).nullable().optional(),
  providerId: z.string().max(60).nullable().optional(),
  fromDate: z.string().regex(DATE),
  untilDate: z.string().regex(DATE).nullable().optional(),
  timeOfDay: z.enum(TIMES_OF_DAY).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  currentAppointmentId: z.string().max(60).nullable().optional(),
})

// ── POST /api/agenda/waitlist — add (or update) a patient's entry ─────────────

export async function POST(req: NextRequest) {
  const guard = await requireStaff({ write: true })
  if (!guard.ok) return guard.response
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: `${issue?.path.join(".") || "body"}: ${issue?.message ?? "invalid"}` }, { status: 400 })
  }
  const body = parsed.data
  if (body.untilDate && body.untilDate < body.fromDate) return NextResponse.json({ error: "The end date is before the start date" }, { status: 400 })
  try {
    const patient = await prisma.patient.findUnique({ where: { id: body.patientId }, select: { id: true } })
    if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 })
    if (body.currentAppointmentId) {
      const appt = await prisma.appointment.findUnique({ where: { id: body.currentAppointmentId }, select: { patientId: true } })
      if (appt?.patientId !== body.patientId) return NextResponse.json({ error: "That appointment belongs to another patient" }, { status: 400 })
    }
    const { entry, created } = await upsertWaitlistEntry(body, guard.user.id)
    prisma.auditLog
      .create({ data: { userId: guard.user.id, action: created ? "CREATE" : "UPDATE", entity: "waitlist_entry", entityId: entry.id, changes: { patientId: body.patientId }, ...requestMeta(req), timestamp: new Date() } })
      .catch(() => {})
    return NextResponse.json({ ...entry, created }, { status: created ? 201 : 200 })
  } catch (error) {
    console.error("[POST /api/agenda/waitlist]", error)
    return NextResponse.json({ error: "Failed to save the waiting list entry" }, { status: 500 })
  }
}
