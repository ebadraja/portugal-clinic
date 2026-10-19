import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth/guards"
import { getClinicSettings } from "@/lib/clinic/settings"
import { listDirectory, type DirectoryQuery } from "@/lib/patients/directory"

export const dynamic = "force-dynamic"

const LIFECYCLES = ["new", "active", "lost", "potential"] as const

// ── GET /api/patients/directory ───────────────────────────────────────────────
// ?q=&lifecycle=new|active|lost|potential&tag=&recall=1&upcoming=yes|no&missing=dob|phone|email
//  &provider=&sort=name|lastVisit|created&page=&limit=

export async function GET(request: NextRequest) {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const sp = request.nextUrl.searchParams
  const pickOne = <T extends string>(v: string | null, allowed: readonly T[]): T | null => (v && (allowed as readonly string[]).includes(v) ? (v as T) : null)
  const query: DirectoryQuery = {
    q: (sp.get("q") ?? "").slice(0, 80),
    lifecycle: pickOne(sp.get("lifecycle"), LIFECYCLES),
    tag: sp.get("tag")?.slice(0, 200) || null,
    recallDue: sp.get("recall") === "1",
    upcoming: pickOne(sp.get("upcoming"), ["yes", "no"] as const),
    missing: pickOne(sp.get("missing"), ["dob", "phone", "email"] as const),
    providerName: sp.get("provider")?.slice(0, 80) || null,
    sort: pickOne(sp.get("sort"), ["name", "lastVisit", "created"] as const) ?? "name",
    page: parseInt(sp.get("page") ?? "1", 10) || 1,
    limit: parseInt(sp.get("limit") ?? "25", 10) || 25,
  }
  try {
    const settings = await getClinicSettings()
    return NextResponse.json(await listDirectory(query, { recallMonths: settings.bookingPolicy.recallMonths, timeZone: settings.timezone }))
  } catch (error) {
    console.error("[GET /api/patients/directory]", error)
    return NextResponse.json({ error: "Failed to load patients" }, { status: 500 })
  }
}
