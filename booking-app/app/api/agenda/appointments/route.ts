import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireStaff } from "@/lib/auth/guards"
import { APPOINTMENT_TYPE_KEYS } from "@/lib/clinic/settings"
import { createAppointment, createSeries } from "@/lib/appointments/booking"
import { bookingFailureResponse, staffActor } from "@/lib/appointments/http"

export const dynamic = "force-dynamic"

const CreateSchema = z.object({
  patientId: z.string().min(1).max(60),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  type: z.enum(APPOINTMENT_TYPE_KEYS),
  durationMinutes: z.number().int().min(5).max(720).optional(),
  providerId: z.string().max(60).nullable().optional(),
  reason: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  allowOverlap: z.boolean().optional(),
  acknowledgeWarnings: z.boolean().optional(),
  notifyPatient: z.boolean().optional(),
  repeat: z.object({ everyWeeks: z.number().int().min(1).max(52), count: z.number().int().min(2).max(52) }).optional(),
})

// ── POST /api/agenda/appointments ─────────────────────────────────────────────
// 201 created · 409 slot taken · 422 the user must confirm warnings (send again with
// acknowledgeWarnings) · with `repeat`: 201 { seriesId, created, skipped }.

export async function POST(req: NextRequest) {
  const guard = await requireStaff({ write: true })
  if (!guard.ok) return guard.response
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: `${issue?.path.join(".") || "body"}: ${issue?.message ?? "invalid"}` }, { status: 400 })
  }
  const { repeat, ...input } = parsed.data
  try {
    const actor = staffActor(guard.user)
    if (repeat) {
      const r = await createSeries(input, repeat, actor)
      if ("ok" in r) return bookingFailureResponse(r)
      return NextResponse.json({ seriesId: r.seriesId, created: r.created.map((a) => a.id), skipped: r.skipped }, { status: 201 })
    }
    const r = await createAppointment(input, actor)
    if (!r.ok) return bookingFailureResponse(r)
    return NextResponse.json({ id: r.appointment.id, warnings: r.warnings }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/agenda/appointments]", error)
    return NextResponse.json({ error: "Failed to create the appointment" }, { status: 500 })
  }
}
