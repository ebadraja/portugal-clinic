import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth/guards"
import { getClinicSettings } from "@/lib/clinic/settings"
import { addDays, isValidDateString } from "@/lib/clinic/time"
import { dayCounts } from "@/lib/appointments/agenda"

export const dynamic = "force-dynamic"

// ── GET /api/agenda/summary?from=YYYY-MM-DD&to=YYYY-MM-DD — appointments per day ──
// Feeds the mini month calendar (how busy each day is).

export async function GET(request: NextRequest) {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const sp = request.nextUrl.searchParams
  const from = sp.get("from") ?? ""
  const to = sp.get("to") ?? ""
  if (!isValidDateString(from) || !isValidDateString(to) || to < from || to > addDays(from, 62)) {
    return NextResponse.json({ error: "Use from/to as YYYY-MM-DD, at most 62 days" }, { status: 400 })
  }
  try {
    const settings = await getClinicSettings()
    return NextResponse.json({ days: await dayCounts(from, to, settings.timezone) })
  } catch (error) {
    console.error("[GET /api/agenda/summary]", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
