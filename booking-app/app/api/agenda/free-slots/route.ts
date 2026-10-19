import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth/guards"
import { APPOINTMENT_TYPE_KEYS, getClinicSettings } from "@/lib/clinic/settings"
import { isValidDateString, todayInZone } from "@/lib/clinic/time"
import { findNextFreeSlots } from "@/lib/appointments/agenda"

export const dynamic = "force-dynamic"

// ── GET /api/agenda/free-slots?type=HYGIENE[&providerId=][&from=YYYY-MM-DD][&limit=10] ──
// "Próximas vagas" — the next free start times, for "when is the next opening?" on the phone.

export async function GET(request: NextRequest) {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const sp = request.nextUrl.searchParams
  const type = sp.get("type") ?? "EVALUATION"
  if (!(APPOINTMENT_TYPE_KEYS as readonly string[]).includes(type)) {
    return NextResponse.json({ error: "Unknown appointment type" }, { status: 400 })
  }
  try {
    const settings = await getClinicSettings()
    const today = todayInZone(settings.timezone)
    const fromParam = sp.get("from")
    const from = fromParam && isValidDateString(fromParam) && fromParam > today ? fromParam : today
    const limit = Math.min(30, Math.max(1, parseInt(sp.get("limit") ?? "10", 10) || 10))
    const slots = await findNextFreeSlots({ settings, type, providerId: sp.get("providerId") || null, fromDate: from, limit })
    return NextResponse.json({ slots })
  } catch (error) {
    console.error("[GET /api/agenda/free-slots]", error)
    return NextResponse.json({ error: "Failed to find free slots" }, { status: 500 })
  }
}
