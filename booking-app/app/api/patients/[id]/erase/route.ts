import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { requireStaff } from "@/lib/auth/guards"
import { erasePatient } from "@/lib/gdpr/patientData"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

const Body = z.object({
  confirmName: z.string().trim().min(1),
  reason: z.string().trim().min(10, "Record the legal basis / request reference (at least 10 characters)").max(500),
})

// ── POST /api/patients/[id]/erase ── admin only (GDPR art. 17) ────────────────
// Irreversible. The admin must type the patient's full name and a reason.
// SMS opt-outs and the audit trail are retained (see lib/gdpr/patientData.ts).

export async function POST(req: NextRequest, { params }: RouteContext) {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const { id } = await params
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })

  const patient = await prisma.patient.findUnique({ where: { id }, select: { firstName: true, lastName: true } })
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 })
  const expected = `${patient.firstName} ${patient.lastName}`.trim().toLowerCase().replace(/\s+/g, " ")
  if (parsed.data.confirmName.toLowerCase().replace(/\s+/g, " ") !== expected) {
    return NextResponse.json({ error: "The name typed does not match the patient's full name." }, { status: 400 })
  }

  try {
    const result = await erasePatient(id, guard.user.id, parsed.data.reason)
    if (!result) return NextResponse.json({ error: "Patient not found" }, { status: 404 })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error("[POST /api/patients/[id]/erase]", (error as Error).message)
    return NextResponse.json({ error: "Erasure failed — nothing was deleted." }, { status: 500 })
  }
}
