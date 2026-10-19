import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import bcrypt from "bcryptjs"
import prisma from "@/lib/prisma"
import { requestMeta, requireStaff } from "@/lib/auth/guards"
import { passwordProblem } from "@/lib/auth/passwordTokens"
import { rateLimit } from "@/lib/auth/rateLimit"

const Body = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) })

// ── POST /api/account/password ────────────────────────────────────────────────
// A wrong current password is a 400 (not 401) so the client doesn't treat it as
// a lost session. Any outstanding reset link is invalidated.

export async function POST(req: NextRequest) {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response

  const limited = rateLimit(`pwchange:${guard.user.id}`, 10, 15 * 60_000)
  if (!limited.ok) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 })

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Fill in both password fields." }, { status: 400 })
  const { currentPassword, newPassword } = parsed.data

  const user = await prisma.user.findUnique({ where: { id: guard.user.id }, select: { passwordHash: true } })
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 })
  }
  const problem = passwordProblem(newPassword)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  if (currentPassword === newPassword) return NextResponse.json({ error: "Choose a password you haven't used here." }, { status: 400 })

  await prisma.user.update({
    where: { id: guard.user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12), passwordTokenHash: null, passwordTokenExpiresAt: null, passwordTokenPurpose: null },
  })
  await prisma.auditLog.create({
    data: { userId: guard.user.id, action: "UPDATE", entity: "user", entityId: guard.user.id, changes: { action: "password_changed" }, ...requestMeta(req), timestamp: new Date() },
  })
  return NextResponse.json({ ok: true })
}
