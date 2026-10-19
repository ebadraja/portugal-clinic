import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { requireStaff } from "@/lib/auth/guards"
import { getClinicSettings, providerById } from "@/lib/clinic/settings"
import { addDays, zonedTimeToUtc } from "@/lib/clinic/time"
import { INACTIVE_STATUSES } from "@/lib/appointments/availability"

export const dynamic = "force-dynamic"

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

const BlockSchema = z
  .object({
    providerId: z.string().max(60).nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Inclusive last day for multi-day blocks (vacation). Defaults to `date`. */
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    start: HHMM.optional(),
    end: HHMM.optional(),
    allDay: z.boolean().optional(),
    kind: z.enum(["TIME_OFF", "VACATION", "MEETING", "OTHER"]).default("TIME_OFF"),
    reason: z.string().trim().max(200).nullable().optional(),
    /** Repeat weekly this many times in total (including the first). */
    repeatWeeks: z.number().int().min(1).max(52).optional(),
  })
  .refine((b) => b.allDay || (b.start && b.end && b.start < b.end), { message: "Give start < end, or allDay" })
  .refine((b) => !b.endDate || b.endDate >= b.date, { message: "endDate must not be before date" })

// ── POST /api/agenda/blocks — block time (nobody can book it) ─────────────────
// Existing appointments in that time are not moved; the response lists how many overlap.

export async function POST(req: NextRequest) {
  const guard = await requireStaff({ write: true })
  if (!guard.ok) return guard.response
  const parsed = BlockSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: `${issue?.path.join(".") || "body"}: ${issue?.message ?? "invalid"}` }, { status: 400 })
  }
  const b = parsed.data
  try {
    const settings = await getClinicSettings()
    if (b.providerId && !providerById(b.providerId, settings.providers)) {
      return NextResponse.json({ error: "Unknown dentist" }, { status: 400 })
    }
    const tz = settings.timezone
    const repeat = b.repeatWeeks ?? 1
    const seriesId = repeat > 1 ? `b_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` : null
    const rows = Array.from({ length: repeat }, (_, i) => {
      const first = addDays(b.date, i * 7)
      const last = addDays(b.endDate ?? b.date, i * 7)
      const startTime = zonedTimeToUtc(first, b.allDay ? "00:00" : b.start!, tz)
      const endTime = b.allDay ? zonedTimeToUtc(addDays(last, 1), "00:00", tz) : zonedTimeToUtc(last, b.end!, tz)
      return { providerId: b.providerId, startTime, endTime, kind: b.kind, reason: b.reason ?? null, seriesId, createdById: guard.user.id }
    })
    await prisma.calendarBlock.createMany({ data: rows })
    const overlapping = await prisma.appointment.count({
      where: {
        status: { notIn: [...INACTIVE_STATUSES] },
        ...(b.providerId && { providerId: b.providerId }),
        OR: rows.map((r) => ({ startTime: { lt: r.endTime }, endTime: { gt: r.startTime } })),
      },
    })
    await prisma.auditLog.create({
      data: { userId: guard.user.id, action: "CREATE", entity: "calendar_block", entityId: seriesId, changes: JSON.parse(JSON.stringify({ ...b, count: rows.length })), timestamp: new Date() },
    })
    return NextResponse.json({ created: rows.length, seriesId, overlappingAppointments: overlapping }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/agenda/blocks]", error)
    return NextResponse.json({ error: "Failed to block the time" }, { status: 500 })
  }
}
