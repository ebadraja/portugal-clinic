import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { requestMeta, requireStaff } from "@/lib/auth/guards"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

const PatchSchema = z.object({
  status: z.enum(["ACTIVE", "REMOVED"]).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  untilDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

// ── PATCH /api/agenda/waitlist/[id] — take off the list, or edit the note ─────

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const guard = await requireStaff({ write: true })
  if (!guard.ok) return guard.response
  const { id } = await params
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  try {
    const exists = await prisma.waitlistEntry.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return NextResponse.json({ error: "Not on the waiting list" }, { status: 404 })
    const entry = await prisma.waitlistEntry.update({ where: { id }, data: parsed.data })
    prisma.auditLog
      .create({ data: { userId: guard.user.id, action: "UPDATE", entity: "waitlist_entry", entityId: id, changes: parsed.data, ...requestMeta(req), timestamp: new Date() } })
      .catch(() => {})
    return NextResponse.json(entry)
  } catch (error) {
    console.error("[PATCH /api/agenda/waitlist/[id]]", error)
    return NextResponse.json({ error: "Failed to update the entry" }, { status: 500 })
  }
}
