import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { requestMeta, requireStaff } from "@/lib/auth/guards"
import { updateSettingsAudited } from "@/lib/clinic/settingsWrite"
import { emailDeliveryConfigured } from "@/lib/auth/passwordEmails"
import { sendEmail } from "@/lib/email/send"

export const dynamic = "force-dynamic"

const SELECT = {
  notificationEmail: true,
  emailEnabled: true,
  emailNewBooking: true,
  emailCancellation: true,
  emailEscalation: true,
  emailNewPatient: true,
} as const

// ── GET /api/settings/notifications ───────────────────────────────────────────

export async function GET() {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const s = await prisma.settings.findFirst({ select: SELECT })
  return NextResponse.json({
    notificationEmail: s?.notificationEmail ?? "",
    emailEnabled: s?.emailEnabled ?? true,
    emailNewBooking: s?.emailNewBooking ?? true,
    emailCancellation: s?.emailCancellation ?? true,
    emailEscalation: s?.emailEscalation ?? true,
    emailNewPatient: s?.emailNewPatient ?? true,
    deliveryConfigured: await emailDeliveryConfigured(),
  })
}

const Patch = z
  .object({
    notificationEmail: z.union([z.literal(""), z.string().trim().email().max(120)]),
    emailEnabled: z.boolean(),
    emailNewBooking: z.boolean(),
    emailCancellation: z.boolean(),
    emailEscalation: z.boolean(),
    emailNewPatient: z.boolean(),
  })
  .partial()
  .strict()

// ── PATCH /api/settings/notifications ── admin only ───────────────────────────

export async function PATCH(req: NextRequest) {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const parsed = Patch.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 })
  const data = { ...parsed.data, ...(parsed.data.notificationEmail !== undefined && { notificationEmail: parsed.data.notificationEmail || null }) }
  await updateSettingsAudited({ data, userId: guard.user.id, section: "notifications", ...requestMeta(req) })
  return GET()
}

// ── POST /api/settings/notifications ── send a test email to the alert address ──

export async function POST() {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const s = await prisma.settings.findFirst({ select: { notificationEmail: true, practiceName: true } })
  if (!s?.notificationEmail) return NextResponse.json({ error: "Save an alert email address first." }, { status: 400 })
  if (!(await emailDeliveryConfigured())) return NextResponse.json({ error: "No email provider is configured (connect Gmail in the Email tab, or set SendGrid/SMTP)." }, { status: 400 })
  try {
    await sendEmail(s.notificationEmail, `Teste de alertas — ${s.practiceName}`, "<p>Este é um email de teste dos alertas do CRM.</p>", "Este é um email de teste dos alertas do CRM.")
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: `Delivery failed: ${(err as Error).message.slice(0, 120)}` }, { status: 502 })
  }
}
