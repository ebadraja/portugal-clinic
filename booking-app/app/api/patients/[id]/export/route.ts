import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requestMeta, requireStaff } from "@/lib/auth/guards"
import { exportPatientData } from "@/lib/gdpr/patientData"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

// ── GET /api/patients/[id]/export ── admin only (GDPR art. 15 / 20) ───────────
// Downloads everything held on the patient as JSON. The export is audited.

export async function GET(req: NextRequest, { params }: RouteContext) {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const { id } = await params
  const data = await exportPatientData(id)
  if (!data) return NextResponse.json({ error: "Patient not found" }, { status: 404 })

  await prisma.auditLog.create({
    data: { userId: guard.user.id, action: "READ", entity: "patient", entityId: id, changes: { gdprExport: true }, ...requestMeta(req), timestamp: new Date() },
  })
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="patient-${id}-export.json"`,
      "Cache-Control": "no-store",
    },
  })
}
