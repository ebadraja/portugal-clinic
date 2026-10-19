import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { requestMeta, requireStaff } from "@/lib/auth/guards"
import { updateSettingsAudited } from "@/lib/clinic/settingsWrite"
import { ALLOWED_IDLE_MINUTES, clearSessionPolicyCache, getSessionPolicy } from "@/lib/auth/sessionPolicy"

export const dynamic = "force-dynamic"

// ── GET /api/settings/security ── admin: session policy + who uses two-factor ──

export async function GET() {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  clearSessionPolicyCache()
  const [policy, staff] = await Promise.all([
    getSessionPolicy(),
    prisma.user.findMany({
      where: { approvalStatus: "APPROVED" },
      select: { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true, twoFactorEnabled: true },
      orderBy: [{ role: "asc" }, { lastName: "asc" }],
    }),
  ])
  return NextResponse.json({ requireAdmin2fa: policy.requireAdmin2fa, idleMinutes: policy.idleMinutes, allowedIdleMinutes: ALLOWED_IDLE_MINUTES, staff })
}

const Patch = z
  .object({
    requireAdmin2fa: z.boolean(),
    idleMinutes: z.number().int().refine((n) => (ALLOWED_IDLE_MINUTES as readonly number[]).includes(n), "Choose one of the listed timeouts"),
  })
  .partial()
  .strict()

// ── PATCH /api/settings/security ── admin only, audited ───────────────────────

export async function PATCH(req: NextRequest) {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const parsed = Patch.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 })
  const data: Record<string, unknown> = {}
  if (parsed.data.requireAdmin2fa !== undefined) data.twoFactorRequired = parsed.data.requireAdmin2fa
  if (parsed.data.idleMinutes !== undefined) data.sessionTimeout = parsed.data.idleMinutes
  await updateSettingsAudited({ data, userId: guard.user.id, section: "security", ...requestMeta(req) })
  clearSessionPolicyCache()
  return GET()
}
