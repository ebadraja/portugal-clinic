import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireStaff } from "@/lib/auth/guards"

export const dynamic = "force-dynamic"

// ── GET /api/callbacks/new-count ──────────────────────────────────────────────
// Sidebar badge. Unlike the other "new since" badges this is the number of
// OPEN callbacks: a work queue stays visible until someone handles it.
// (`since` is accepted for interface parity and ignored.)

export async function GET() {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const count = await prisma.callbackRequest.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } })
  return NextResponse.json({ count })
}
