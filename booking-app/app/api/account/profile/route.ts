import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { requestMeta, requireStaff } from "@/lib/auth/guards"

const PROFILE_SELECT = { id: true, firstName: true, lastName: true, email: true, phone: true, jobTitle: true, role: true } as const

// ── GET /api/account/profile ── the signed-in user's own profile ──────────────

export async function GET() {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const user = await prisma.user.findUnique({ where: { id: guard.user.id }, select: PROFILE_SELECT })
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(user)
}

const Patch = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  jobTitle: z.string().trim().max(80).nullable().optional(),
})

// ── PATCH /api/account/profile ── email and role are changed by an admin only ──

export async function PATCH(req: NextRequest) {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const parsed = Patch.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 })

  const data = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined))
  const user = await prisma.user.update({ where: { id: guard.user.id }, data, select: PROFILE_SELECT })
  await prisma.auditLog.create({
    data: { userId: guard.user.id, action: "UPDATE", entity: "user", entityId: guard.user.id, changes: { fields: Object.keys(data), self: true }, ...requestMeta(req), timestamp: new Date() },
  })
  return NextResponse.json(user)
}
