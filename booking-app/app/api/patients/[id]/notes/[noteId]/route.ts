import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requestMeta, requireStaff } from "@/lib/auth/guards"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string; noteId: string }> }

// ── DELETE /api/patients/[id]/notes/[noteId] — the author or an admin ─────────

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const guard = await requireStaff({ write: true })
  if (!guard.ok) return guard.response
  const { id, noteId } = await params
  try {
    const note = await prisma.patientNote.findUnique({ where: { id: noteId }, select: { patientId: true, authorId: true, noteType: true } })
    if (!note || note.patientId !== id) return NextResponse.json({ error: "Note not found" }, { status: 404 })
    if (note.authorId !== guard.user.id && guard.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Only the author or an administrator can delete this note" }, { status: 403 })
    }
    await prisma.patientNote.delete({ where: { id: noteId } })
    await prisma.auditLog.create({
      data: { userId: guard.user.id, action: "DELETE", entity: "patient_note", entityId: noteId, changes: { patientId: id, noteType: note.noteType }, ...requestMeta(req), timestamp: new Date() },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[DELETE /api/patients/[id]/notes/[noteId]]", error)
    return NextResponse.json({ error: "Failed to delete the note" }, { status: 500 })
  }
}
