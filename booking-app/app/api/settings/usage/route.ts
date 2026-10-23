import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireStaff } from "@/lib/auth/guards"
import { getClinicSettings } from "@/lib/clinic/settings"
import { todayInZone, zonedTimeToUtc } from "@/lib/clinic/time"

export const dynamic = "force-dynamic"

function monthBounds(month: string, tz: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number)
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`
  return { start: zonedTimeToUtc(`${month}-01`, "00:00", tz), end: zonedTimeToUtc(next, "00:00", tz) }
}

// ── GET /api/settings/usage?month=YYYY-MM ── admin only ───────────────────────
// Real voice-agent usage from the call log (replaces the hard-coded plan/usage card).

export async function GET(req: NextRequest) {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const settings = await getClinicSettings()
  const requested = req.nextUrl.searchParams.get("month")
  const month = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : todayInZone(settings.timezone).slice(0, 7)
  const { start, end } = monthBounds(month, settings.timezone)
  const inMonth = { startTime: { gte: start, lt: end } }

  const [calls, duration, byOutcome, voiceBookings, callbacks] = await Promise.all([
    prisma.callLog.count({ where: inMonth }),
    prisma.callLog.aggregate({ where: inMonth, _sum: { duration: true } }),
    prisma.callLog.groupBy({ by: ["outcome"], where: inMonth, _count: { _all: true } }),
    prisma.appointment.count({ where: { bookedVia: "VOICE_AGENT", createdAt: { gte: start, lt: end } } }),
    prisma.callbackRequest.count({ where: { createdAt: { gte: start, lt: end } } }),
  ])
  const seconds = duration._sum.duration ?? 0
  return NextResponse.json({
    month,
    calls,
    minutes: Math.round((seconds / 60) * 10) / 10,
    averageCallSeconds: calls > 0 ? Math.round(seconds / calls) : null,
    byOutcome: Object.fromEntries(byOutcome.map((r) => [r.outcome, r._count._all])),
    appointmentsBookedByVoice: voiceBookings,
    callbackRequests: callbacks,
  })
}
