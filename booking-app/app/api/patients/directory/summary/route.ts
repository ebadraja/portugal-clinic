import { NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth/guards"
import { getClinicSettings } from "@/lib/clinic/settings"
import { directoryCounts, tagCounts } from "@/lib/patients/directory"

export const dynamic = "force-dynamic"

// ── GET /api/patients/directory/summary — counts for the filter chips + tags in use ──

export async function GET() {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  try {
    const settings = await getClinicSettings()
    const [counts, tags] = await Promise.all([directoryCounts({ recallMonths: settings.bookingPolicy.recallMonths }), tagCounts()])
    return NextResponse.json({ counts, tags, recallMonths: settings.bookingPolicy.recallMonths })
  } catch (error) {
    console.error("[GET /api/patients/directory/summary]", error)
    return NextResponse.json({ error: "Failed to load the summary" }, { status: 500 })
  }
}
