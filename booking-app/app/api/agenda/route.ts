import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth/guards"
import { getClinicSettings } from "@/lib/clinic/settings"
import { addDays, isValidDateString } from "@/lib/clinic/time"
import { MAX_RANGE_DAYS, loadAgenda } from "@/lib/appointments/agenda"

export const dynamic = "force-dynamic"

// ── GET /api/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD[&includeCancelled=1] ─────────
// Everything the calendar shows for a range (clinic wall time), with no row cap.

export async function GET(request: NextRequest) {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const sp = request.nextUrl.searchParams
  const from = sp.get("from") ?? ""
  const to = sp.get("to") ?? from
  if (!isValidDateString(from) || !isValidDateString(to) || to < from) {
    return NextResponse.json({ error: "Use from/to as YYYY-MM-DD with from <= to" }, { status: 400 })
  }
  if (to > addDays(from, MAX_RANGE_DAYS)) {
    return NextResponse.json({ error: `At most ${MAX_RANGE_DAYS} days per request` }, { status: 400 })
  }
  try {
    const settings = await getClinicSettings()
    const data = await loadAgenda({ from, to, includeCancelled: sp.get("includeCancelled") === "1", settings })
    return NextResponse.json(data)
  } catch (error) {
    console.error("[GET /api/agenda]", error)
    return NextResponse.json({ error: "Failed to load the agenda" }, { status: 500 })
  }
}
