import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { consumePasswordToken, lookupPasswordToken } from "@/lib/auth/passwordTokens"
import { clientKey, rateLimit } from "@/lib/auth/rateLimit"

export const dynamic = "force-dynamic"

function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!domain) return "***"
  return `${local.slice(0, 2)}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`
}

// ── GET /api/auth/password-token?token=… ──────────────────────────────────────
// Public. Tells the set-password form whether a link is still valid.

export async function GET(req: NextRequest) {
  const limited = rateLimit(`pwtoken:${clientKey(req)}`, 30, 15 * 60_000)
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  const found = await lookupPasswordToken(req.nextUrl.searchParams.get("token"))
  if (!found.ok) return NextResponse.json({ valid: false, reason: found.reason })
  return NextResponse.json({ valid: true, purpose: found.user.purpose, firstName: found.user.firstName, email: maskEmail(found.user.email) })
}

const Body = z.object({ token: z.string().min(20).max(200), password: z.string().min(1).max(200) })

// ── POST /api/auth/password-token ─────────────────────────────────────────────
// Public. Sets the password with a one-time link; the link is burned on use.

export async function POST(req: NextRequest) {
  const limited = rateLimit(`pwtoken:${clientKey(req)}`, 30, 15 * 60_000)
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

  const result = await consumePasswordToken(parsed.data.token, parsed.data.password)
  if (!result.ok) {
    if (result.reason === "weak") return NextResponse.json({ error: result.message }, { status: 400 })
    return NextResponse.json(
      { error: result.reason === "expired" ? "This link has expired. Ask an admin for a new one, or use “Forgot password”." : "This link is not valid (it may already have been used)." },
      { status: 400 },
    )
  }

  const user = await prisma.user.findUnique({ where: { id: result.userId }, select: { approvalStatus: true, isActive: true } })
  await prisma.auditLog.create({
    data: { userId: result.userId, action: "UPDATE", entity: "user", entityId: result.userId, changes: { action: "password_set", via: result.purpose }, ipAddress: clientKey(req), timestamp: new Date() },
  })

  const canSignIn = user?.approvalStatus === "APPROVED" && user.isActive
  return NextResponse.json({
    ok: true,
    canSignIn,
    message: canSignIn ? "Password saved. You can sign in now." : "Password saved. An admin still needs to approve your account before you can sign in.",
  })
}
