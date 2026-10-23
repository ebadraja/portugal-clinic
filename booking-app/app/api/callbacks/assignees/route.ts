import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireStaff } from "@/lib/auth/guards"

export const dynamic = "force-dynamic"

// ── GET /api/callbacks/assignees ──────────────────────────────────────────────
// Active staff a callback can be assigned to (names only, any signed-in staff).

export async function GET() {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const data = await prisma.user.findMany({
    where: { isActive: true, approvalStatus: "APPROVED" },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })
  return NextResponse.json({ data })
}
