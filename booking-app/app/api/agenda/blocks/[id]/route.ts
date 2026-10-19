import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireStaff } from "@/lib/auth/guards"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

// ── DELETE /api/agenda/blocks/[id][?series=following] ─────────────────────────
// Frees the time again. With series=following, this and every later block of the series.

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const guard = await requireStaff({ write: true })
  if (!guard.ok) return guard.response
  const { id } = await params
  try {
    const block = await prisma.calendarBlock.findUnique({ where: { id } })
    if (!block) return NextResponse.json({ error: "Block not found" }, { status: 404 })
    const following = req.nextUrl.searchParams.get("series") === "following" && block.seriesId
    const { count } = following
      ? await prisma.calendarBlock.deleteMany({ where: { seriesId: block.seriesId, startTime: { gte: block.startTime } } })
      : await prisma.calendarBlock.deleteMany({ where: { id } })
    await prisma.auditLog.create({
      data: {
        userId: guard.user.id, action: "DELETE", entity: "calendar_block", entityId: id,
        changes: JSON.parse(JSON.stringify({ before: block, removed: count })), timestamp: new Date(),
      },
    })
    return NextResponse.json({ removed: count })
  } catch (error) {
    console.error("[DELETE /api/agenda/blocks/[id]]", error)
    return NextResponse.json({ error: "Failed to remove the block" }, { status: 500 })
  }
}
