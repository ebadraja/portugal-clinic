import { NextRequest, NextResponse } from "next/server"
import { getDayAvailability } from "@/lib/appointments/availability"
import { requireStaff } from "@/lib/auth/guards"

export const dynamic = "force-dynamic"

// ── GET /api/appointments/availability ───────────────────────────────────────
// Staff only. Times are clinic wall time (Settings.timezone, Europe/Lisbon).
// Query params:
//   date     – YYYY-MM-DD (required)
//   provider – string (optional; case-insensitive exact match)
//   duration – minutes per slot (default: booking policy slot length)

export async function GET(request: NextRequest) {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const { searchParams } = request.nextUrl

  const dateParam     = searchParams.get("date")
  const providerParam = searchParams.get("provider") ?? undefined
  const rawDuration   = parseInt(searchParams.get("duration") ?? "", 10)
  const duration      = isNaN(rawDuration) || rawDuration <= 0 ? undefined : rawDuration

  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json(
      { error: "Missing or invalid 'date' parameter. Expected YYYY-MM-DD." },
      { status: 400 }
    )
  }

  try {
    const result = await getDayAvailability({
      date: dateParam,
      provider: providerParam,
      duration,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error("[GET /api/appointments/availability]", error)
    return NextResponse.json(
      { error: "Failed to fetch available slots" },
      { status: 500 }
    )
  }
}
