import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import bcrypt from "bcryptjs"
import prisma from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { requestMeta, requireStaff } from "@/lib/auth/guards"
import { generateTotpSecret, otpauthUri } from "@/lib/auth/totp"
import { consumeTotpCode, readSecret } from "@/lib/auth/twoFactor"
import { getSessionPolicy, mustEnrollTwoFactor } from "@/lib/auth/sessionPolicy"
import { rateLimit } from "@/lib/auth/rateLimit"

export const dynamic = "force-dynamic"

const SELECT = { id: true, email: true, role: true, twoFactorEnabled: true, twoFactorSecret: true, twoFactorLastStep: true, passwordHash: true } as const

// ── GET /api/account/2fa ── the signed-in user's two-factor status ────────────

export async function GET() {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const [user, policy] = await Promise.all([
    prisma.user.findUnique({ where: { id: guard.user.id }, select: SELECT }),
    getSessionPolicy(),
  ])
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({
    enabled: user.twoFactorEnabled,
    pendingSetup: !user.twoFactorEnabled && !!readSecret(user.twoFactorSecret),
    requiredByPolicy: policy.requireAdmin2fa && user.role === "ADMIN",
  })
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup") }),
  z.object({ action: z.literal("enable"), code: z.string().min(6).max(10) }),
  z.object({ action: z.literal("disable"), password: z.string().min(1).max(200), code: z.string().min(6).max(10) }),
])

// ── POST /api/account/2fa ── setup → enable (confirm a code) / disable ────────

export async function POST(req: NextRequest) {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const limited = rateLimit(`2fa:${guard.user.id}`, 10, 15 * 60_000)
  if (!limited.ok) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 })

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const user = await prisma.user.findUnique({ where: { id: guard.user.id }, select: SELECT })
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const audit = (action: string) =>
    prisma.auditLog.create({
      data: { userId: user.id, action: "UPDATE", entity: "user", entityId: user.id, changes: { action }, ...requestMeta(req), timestamp: new Date() },
    })

  const body = parsed.data

  if (body.action === "setup") {
    if (user.twoFactorEnabled) return NextResponse.json({ error: "Two-factor is already on. Turn it off first to re-link a new phone." }, { status: 409 })
    const secret = generateTotpSecret()
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: encrypt(secret), twoFactorLastStep: null } })
    const settings = await prisma.settings.findFirst({ select: { practiceName: true } })
    return NextResponse.json({ secret, otpauthUri: otpauthUri(secret, user.email, settings?.practiceName ?? "Clínica Dentária Nunes Monteiro") })
  }

  if (body.action === "enable") {
    if (user.twoFactorEnabled) return NextResponse.json({ ok: true, enabled: true })
    if (!readSecret(user.twoFactorSecret)) return NextResponse.json({ error: "Start the setup first." }, { status: 400 })
    if (!(await consumeTotpCode(user, body.code))) {
      return NextResponse.json({ error: "That code is not valid. Check the time on your phone and try the newest code." }, { status: 400 })
    }
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } })
    await audit("two_factor_enabled")
    return NextResponse.json({ ok: true, enabled: true })
  }

  // disable
  const policy = await getSessionPolicy()
  if (mustEnrollTwoFactor(user.role, false, policy)) {
    return NextResponse.json({ error: "Clinic policy requires two-factor for administrators." }, { status: 403 })
  }
  if (!user.twoFactorEnabled) return NextResponse.json({ ok: true, enabled: false })
  if (!(await bcrypt.compare(body.password, user.passwordHash))) {
    return NextResponse.json({ error: "Password is incorrect." }, { status: 400 })
  }
  if (!(await consumeTotpCode(user, body.code))) {
    return NextResponse.json({ error: "That code is not valid." }, { status: 400 })
  }
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorLastStep: null } })
  await audit("two_factor_disabled")
  return NextResponse.json({ ok: true, enabled: false })
}
