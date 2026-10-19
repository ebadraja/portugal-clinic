import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { requestMeta, requireStaff } from "@/lib/auth/guards"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

/** What happened on the check-up call → how long the patient leaves the call list, and the note left on the record. */
const RECALL_OUTCOMES = {
  no_answer: { days: 7, note: "Check-up call: no answer." },
  call_back: { days: 14, note: "Check-up call: will call back to book." },
  later: { days: 90, note: "Check-up call: not now — try again in 3 months." },
  declined: { days: 365, note: "Check-up call: does not want a check-up for now." },
} as const

const Schema = z.object({
  outcome: z.enum(Object.keys(RECALL_OUTCOMES) as [keyof typeof RECALL_OUTCOMES, ...(keyof typeof RECALL_OUTCOMES)[]]),
  comment: z.string().trim().max(500).optional(),
})

// ── POST /api/patients/[id]/recall — log a check-up call ─────────────────────

export async function POST(req: NextRequest, { params }: RouteContext) {
  const guard = await requireStaff({ write: true })
  if (!guard.ok) return guard.response
  const { id } = await params
  const parsed = Schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Choose what happened on the call" }, { status: 400 })
  const { days, note } = RECALL_OUTCOMES[parsed.data.outcome]
  try {
    const exists = await prisma.patient.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return NextResponse.json({ error: "Patient not found" }, { status: 404 })
    const until = new Date(Date.now() + days * 86_400_000)
    await prisma.$transaction([
      prisma.patient.update({ where: { id }, data: { recallSnoozedUntil: until } }),
      prisma.patientNote.create({
        data: { patientId: id, authorId: guard.user.id, noteType: "FOLLOW_UP", content: parsed.data.comment ? `${note} ${parsed.data.comment}` : note },
      }),
    ])
    prisma.auditLog
      .create({ data: { userId: guard.user.id, action: "UPDATE", entity: "patient_recall", entityId: id, changes: { outcome: parsed.data.outcome }, ...requestMeta(req), timestamp: new Date() } })
      .catch(() => {})
    return NextResponse.json({ snoozedUntil: until.toISOString() })
  } catch (error) {
    console.error("[POST /api/patients/[id]/recall]", error)
    return NextResponse.json({ error: "Failed to save the call" }, { status: 500 })
  }
}
