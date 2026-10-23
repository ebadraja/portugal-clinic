import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireStaff } from "@/lib/auth/guards"
import { getSystemStatus } from "@/lib/clinic/systemStatus"
import { emailDeliveryConfigured } from "@/lib/auth/passwordEmails"
import { getVoiceDeliveryStatus } from "@/lib/voice/webhookLog"

export const dynamic = "force-dynamic"

// ── GET /api/settings/status ── admin only ────────────────────────────────────
// System status checks + the real state of each integration (replaces the
// hard-coded "connected" cards).

export async function GET() {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  try {
    const [status, row, emailOk, delivery] = await Promise.all([
      getSystemStatus(),
      prisma.settings.findFirst({
        select: { gmailEnabled: true, gmailRefreshToken: true, gmailSenderEmail: true },
      }),
      emailDeliveryConfigured(),
      getVoiceDeliveryStatus(),
    ])
    const env = process.env
    const integrations = [
      { name: "Vapi", service: "Voice agent (Acácia)", connected: !!env.VAPI_WEBHOOK_SECRET?.trim() && !!delivery.lastReportAt, detail: delivery.lastReportAt ? `Last call report ${new Date(delivery.lastReportAt).toLocaleString("pt-PT")}` : env.VAPI_WEBHOOK_SECRET?.trim() ? "Secret set — no call report received yet" : "Webhook secret not set", tab: "ai" },
      { name: "Gmail", service: "Email sending", connected: !!(row?.gmailEnabled && row.gmailRefreshToken), detail: row?.gmailSenderEmail ?? "Not connected", tab: "email" },
      { name: "SendGrid / SMTP", service: "Email fallback", connected: !!env.SENDGRID_API_KEY || !!(env.SMTP_USER && env.SMTP_PASS), detail: env.SENDGRID_API_KEY ? "SendGrid key set" : env.SMTP_USER ? "SMTP credentials set" : "Not configured", tab: null },
      { name: "Twilio", service: "SMS reminders", connected: !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER), detail: env.TWILIO_PHONE_NUMBER ? `From ${env.TWILIO_PHONE_NUMBER}` : "Not configured", tab: "agenda" },
    ]
    return NextResponse.json({ ...status, integrations, emailDeliveryConfigured: emailOk })
  } catch (error) {
    console.error("[GET /api/settings/status]", error)
    return NextResponse.json({ error: "Failed to load status" }, { status: 500 })
  }
}
