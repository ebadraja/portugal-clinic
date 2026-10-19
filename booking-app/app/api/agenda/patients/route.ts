import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth/guards"
import { searchPatients } from "@/lib/appointments/agenda"

export const dynamic = "force-dynamic"

// ── GET /api/agenda/patients?q=maria santos — booking popover search ─────────

export async function GET(request: NextRequest) {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 80)
  if (q.trim().length < 2) return NextResponse.json({ patients: [] })
  try {
    return NextResponse.json({ patients: await searchPatients(q) })
  } catch (error) {
    console.error("[GET /api/agenda/patients]", error)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
