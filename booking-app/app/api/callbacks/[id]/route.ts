import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@/lib/generated/prisma/client"
import prisma from "@/lib/prisma"
import { requestMeta, requireStaff } from "@/lib/auth/guards"

type RouteContext = { params: Promise<{ id: string }> }

const Patch = z
  .object({
    status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]),
    urgency: z.enum(["LOW", "NORMAL", "URGENT"]),
    assignedToId: z.string().min(1).nullable(),
    patientId: z.string().min(1).nullable(),
    dueAt: z.string().datetime().nullable(),
    resolutionNote: z.string().trim().max(2000).nullable(),
  })
  .partial()
  .strict()

// ── PATCH /api/callbacks/[id] ── assign, set due time, resolve ────────────────

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const guard = await requireStaff({ write: true })
  if (!guard.ok) return guard.response
  const { id } = await params
  const parsed = Patch.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 })

  const before = await prisma.callbackRequest.findUnique({ where: { id } })
  if (!before) return NextResponse.json({ error: "Callback not found" }, { status: 404 })

  const p = parsed.data
  if (p.status === "DONE" && !(p.resolutionNote ?? before.resolutionNote)) {
    return NextResponse.json({ error: "Add a short note on the outcome before closing." }, { status: 400 })
  }

  const data: Prisma.CallbackRequestUpdateInput = {}
  if (p.status !== undefined) {
    data.status = p.status
    data.completedAt = p.status === "DONE" || p.status === "CANCELLED" ? new Date() : null
  }
  if (p.urgency !== undefined) data.urgency = p.urgency
  if (p.assignedToId !== undefined) data.assignedTo = p.assignedToId ? { connect: { id: p.assignedToId } } : { disconnect: true }
  if (p.patientId !== undefined) data.patient = p.patientId ? { connect: { id: p.patientId } } : { disconnect: true }
  if (p.dueAt !== undefined) data.dueAt = p.dueAt ? new Date(p.dueAt) : null
  if (p.resolutionNote !== undefined) data.resolutionNote = p.resolutionNote

  try {
    const updated = await prisma.callbackRequest.update({
      where: { id },
      data,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    })
    await prisma.auditLog.create({
      data: {
        userId: guard.user.id,
        action: "UPDATE",
        entity: "callback_request",
        entityId: id,
        changes: { fields: Object.keys(p), before: { status: before.status, assignedToId: before.assignedToId }, after: { status: updated.status, assignedToId: updated.assignedToId } },
        ...requestMeta(req),
        timestamp: new Date(),
      },
    })
    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2025" || error.code === "P2003")) {
      return NextResponse.json({ error: "Assignee or patient not found" }, { status: 400 })
    }
    console.error("[PATCH /api/callbacks/[id]]", error)
    return NextResponse.json({ error: "Failed to update callback" }, { status: 500 })
  }
}
