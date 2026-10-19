import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import bcrypt from "bcryptjs"
import prisma from "@/lib/prisma"
import { clientKey, rateLimit } from "@/lib/auth/rateLimit"

export const dynamic = "force-dynamic"

// A real bcrypt hash (cost 12) used when the email has no account, so the response time matches.
const DUMMY_HASH = bcrypt.hashSync("no-account-placeholder-password", 12)

const Body = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(200) })

// ── POST /api/auth/login-check ────────────────────────────────────────────────
// Public. Step 1 of sign-in: tells the login page whether to ask for a
// two-factor code. Says nothing more than a sign-in attempt would (wrong
// credentials → { ok: false }). Rate-limited per client and per email.

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false })
  const byClient = rateLimit(`login:${clientKey(req)}`, 20, 15 * 60_000)
  const byEmail = rateLimit(`login-email:${parsed.data.email}`, 10, 15 * 60_000)
  if (!byClient.ok || !byEmail.ok) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Wait a few minutes and try again." }, { status: 429 })
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: parsed.data.email, mode: "insensitive" } },
    select: { passwordHash: true, isActive: true, approvalStatus: true, twoFactorEnabled: true },
  })
  // Compare even when the user doesn't exist, so timing doesn't reveal which emails have accounts.
  const hash = user?.passwordHash ?? DUMMY_HASH
  const valid = await bcrypt.compare(parsed.data.password, hash)
  if (!user || !valid || !user.isActive || user.approvalStatus !== "APPROVED") return NextResponse.json({ ok: false })
  return NextResponse.json({ ok: true, twoFactor: user.twoFactorEnabled })
}
