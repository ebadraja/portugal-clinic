import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { requestMeta, requireStaff } from "@/lib/auth/guards"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

const NoteSchema = z.object({
  content: z.string().trim().min(1, "Write something first").max(5000),
  noteType: z.enum(["GENERAL", "MEDICAL", "ADMINISTRATIVE", "FOLLOW_UP", "ALERT"]).default("GENERAL"),
})

// ── POST /api/patients/[id]/notes — add a note to the record ──────────────────

export async function POST(req: NextRequest, { params }: RouteContext) {
  const guard = await requireStaff({ write: true })
  if (!guard.ok) return guard.response
  const { id } = await params
  const parsed = NoteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid note" }, { status: 400 })
  try {
    const exists = await prisma.patient.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return NextResponse.json({ error: "Patient not found" }, { status: 404 })
    const note = await prisma.patientNote.create({
      data: { patientId: id, authorId: guard.user.id, content: parsed.data.content, noteType: parsed.data.noteType },
      include: { author: { select: { firstName: true, lastName: true, role: true } } },
    })
    prisma.auditLog
      .create({ data: { userId: guard.user.id, action: "CREATE", entity: "patient_note", entityId: note.id, changes: { patientId: id, noteType: note.noteType }, ...requestMeta(req), timestamp: new Date() } })
      .catch(() => {})
    return NextResponse.json(note, { status: 201 })
  } catch (error) {
    console.error("[POST /api/patients/[id]/notes]", error)
    return NextResponse.json({ error: "Failed to save the note" }, { status: 500 })
  }
}
