import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth/guards"
import { searchPatients } from "@/lib/appointments/agenda"
import { getClinicSettings } from "@/lib/clinic/settings"

export const dynamic = "force-dynamic"

// ── GET /api/agenda/patients?q=maria santos[&withAppointments=1] ─────────────
// Booking popover search; with withAppointments=1 (agenda search) each hit carries its
// appointments from the last year and upcoming, to jump straight to them.

export async function GET(request: NextRequest) {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 80)
  if (q.trim().length < 2) return NextResponse.json({ patients: [] })
  try {
    const withAppointments = request.nextUrl.searchParams.get("withAppointments") === "1"
    const tz = withAppointments ? (await getClinicSettings()).timezone : undefined
    return NextResponse.json({ patients: await searchPatients(q, 8, { withAppointments, timeZone: tz }) })
  } catch (error) {
    console.error("[GET /api/agenda/patients]", error)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
