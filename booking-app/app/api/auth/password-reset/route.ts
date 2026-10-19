import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { TOKEN_TTL_HOURS, issuePasswordToken } from "@/lib/auth/passwordTokens"
import { emailDeliveryConfigured, sendPasswordLinkEmail } from "@/lib/auth/passwordEmails"
import { clientKey, rateLimit } from "@/lib/auth/rateLimit"

export const dynamic = "force-dynamic"

const Body = z.object({ email: z.string().trim().toLowerCase().email().max(200) })

// The same answer whether or not the address belongs to an account.
const GENERIC = {
  ok: true,
  message: "If an account exists for that email, a reset link has been sent. It is valid for 2 hours.",
}

// ── POST /api/auth/password-reset ─────────────────────────────────────────────
// Public ("forgot password"). Emails a single-use, 2-hour link to active,
// approved staff. Never reveals whether the email exists.

export async function POST(req: NextRequest) {
  const limited = rateLimit(`pwreset:${clientKey(req)}`, 5, 15 * 60_000)
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } })
  }

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })

  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: parsed.data.email, mode: "insensitive" } },
      select: { id: true, email: true, firstName: true, isActive: true, approvalStatus: true, passwordTokenExpiresAt: true, passwordTokenPurpose: true },
    })
    if (user && user.isActive && user.approvalStatus === "APPROVED") {
      // Don't re-issue (and re-email) more than once a minute per account.
      const issuedAt = user.passwordTokenExpiresAt && user.passwordTokenPurpose === "reset"
        ? user.passwordTokenExpiresAt.getTime() - TOKEN_TTL_HOURS.reset * 3_600_000
        : 0
      if (Date.now() - issuedAt > 60_000 && (await emailDeliveryConfigured())) {
        const { url } = await issuePasswordToken(user.id, "reset")
        const sent = await sendPasswordLinkEmail({ to: user.email, firstName: user.firstName, url, purpose: "reset" })
        await prisma.auditLog.create({
          data: { userId: user.id, action: "UPDATE", entity: "user", entityId: user.id, changes: { action: "password_reset_requested", emailSent: sent }, ipAddress: clientKey(req), timestamp: new Date() },
        })
      }
    }
  } catch (err) {
    console.error("[password-reset] failed:", (err as Error).message)
  }
  return NextResponse.json(GENERIC)
}
