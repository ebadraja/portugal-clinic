import { NextRequest, NextResponse } from "next/server"
import { getDayAvailability } from "@/lib/appointments/availability"

export const dynamic = "force-dynamic"

// ── GET /api/appointments/availability ───────────────────────────────────────
// Query params:
//   date     – YYYY-MM-DD (required)
//   provider – string (optional; case-insensitive exact match)
//   duration – minutes per slot (default 30)

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const dateParam     = searchParams.get("date")
  const providerParam = searchParams.get("provider") ?? undefined
  const rawDuration   = parseInt(searchParams.get("duration") ?? "30", 10)
  const duration      = isNaN(rawDuration) || rawDuration <= 0 ? 30 : rawDuration

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
