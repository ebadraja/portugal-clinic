import { NextRequest, NextResponse } from "next/server"
import { requestMeta, requireStaff } from "@/lib/auth/guards"
import { getClinicSettings, portugueseNationalHolidays } from "@/lib/clinic/settings"
import { ClinicSettingsPatchSchema, toSettingsData, updateSettingsAudited } from "@/lib/clinic/settingsWrite"
import { todayInZone } from "@/lib/clinic/time"

export const dynamic = "force-dynamic"

// ── GET /api/settings/clinic ──────────────────────────────────────────────────
// Practice info, identity, hours, holidays, booking policy, providers, insurers
// and appointment types — validated, with defaults for anything never saved.

export async function GET() {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  try {
    const settings = await getClinicSettings()
    const year = Number(todayInZone(settings.timezone).slice(0, 4))
    return NextResponse.json({
      ...settings,
      nationalHolidays: [...portugueseNationalHolidays(year), ...portugueseNationalHolidays(year + 1)],
    })
  } catch (error) {
    console.error("[GET /api/settings/clinic]", error)
    return NextResponse.json({ error: "Failed to load clinic settings" }, { status: 500 })
  }
}

// ── PATCH /api/settings/clinic ── admin only; send only the sections you change ──

export async function PATCH(req: NextRequest) {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response

  const parsed = ClinicSettingsPatchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: `${issue?.path.join(".") || "body"}: ${issue?.message ?? "invalid"}` }, { status: 400 })
  }

  try {
    await updateSettingsAudited({
      data: toSettingsData(parsed.data),
      userId: guard.user.id,
      section: Object.keys(parsed.data).join(","),
      ...requestMeta(req),
    })
    return NextResponse.json(await getClinicSettings())
  } catch (error) {
    console.error("[PATCH /api/settings/clinic]", error)
    return NextResponse.json({ error: "Failed to save clinic settings" }, { status: 500 })
  }
}
