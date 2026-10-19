import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth/guards"
import { getClinicSettings } from "@/lib/clinic/settings"
import { ImportError, normaliseMap, runZappyImport, type ReportRow } from "@/lib/import/zappyImport"
import type { ZappyMap } from "@/lib/import/zappy"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Vercel refuses request bodies above ~4.5 MB; say so clearly before it does. */
const MAX_BYTES = 4 * 1024 * 1024
/** Leave time to answer before the function limit. */
const BUDGET_MS = 45_000

const PROBLEM_ACTIONS = new Set(["reject", "duplicate", "error", "missing", "missing-next"])
const WARNING_RE = /not recognised|invalid|not valid|no surname/

// ── POST /api/patients/import/zappy — Patients → "Import from Zappy" ──────────
// multipart/form-data: clients (file), bookings (file, optional), commit ("1"),
// createNextFromClients ("1"), cancelMissing ("1"), map (JSON: services/staff/defaults).
// Preview (no commit) writes nothing. Commit returns complete:false when it ran out of time —
// send the same request again to continue (already-imported rows are skipped).

export async function POST(req: NextRequest) {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const length = Number(req.headers.get("content-length") ?? 0)
  if (length > MAX_BYTES * 2 + 64 * 1024) {
    return NextResponse.json({ error: "Files are too large to upload (max 4 MB each). Split the export by year, or use scripts/import-zappy.ts." }, { status: 413 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Send the CSV files as a form upload." }, { status: 400 })
  }
  const file = async (name: string): Promise<Uint8Array | null> => {
    const f = form.get(name)
    if (!f || typeof f === "string" || f.size === 0) return null
    if (f.size > MAX_BYTES) throw new ImportError(`${f.name} is larger than 4 MB. Split the export by year, or use scripts/import-zappy.ts.`)
    return new Uint8Array(await f.arrayBuffer())
  }

  try {
    const [clients, bookings] = await Promise.all([file("clients"), file("bookings")])
    if (!clients && !bookings) return NextResponse.json({ error: "Choose the Zappy clients export (and optionally the appointment list)." }, { status: 400 })
    const settings = await getClinicSettings()
    let rawMap: Partial<ZappyMap> | null = null
    const mapField = form.get("map")
    if (typeof mapField === "string" && mapField.trim()) rawMap = JSON.parse(mapField)
    const map = normaliseMap(rawMap, settings.providers.map((p) => p.id))
    const commit = form.get("commit") === "1"

    const r = await runZappyImport({
      clients,
      bookings,
      map,
      commit,
      createNextFromClients: form.get("createNextFromClients") === "1",
      cancelMissing: form.get("cancelMissing") === "1",
      deadline: commit ? Date.now() + BUDGET_MS : undefined,
      userId: guard.user.id,
    })

    const problems: ReportRow[] = r.report.filter((row) => PROBLEM_ACTIONS.has(row.action) || WARNING_RE.test(row.detail))
    // The full row-by-row report only for the preview (it is what people check); commits return counts.
    const report = commit ? [] : r.report.filter((row) => row.action !== "unchanged")
    return NextResponse.json({ ...r, report, problems: problems.slice(0, 2000), problemCount: problems.length })
  } catch (error) {
    if (error instanceof ImportError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error("[POST /api/patients/import/zappy]", error)
    return NextResponse.json({ error: "The import stopped unexpectedly. Nothing after the last completed row was written; run it again to continue." }, { status: 500 })
  }
}
