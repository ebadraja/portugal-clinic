import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireStaff } from "@/lib/auth/guards"
import { getClinicSettings } from "@/lib/clinic/settings"
import { toE164 } from "@/lib/clinic/phone"
import { publicBaseUrl } from "@/lib/appointments/notifications"
import { renderEmail, renderSms, type MessageContext } from "@/lib/appointments/messages"
import { defaultSenders } from "@/lib/appointments/dispatch"

export const dynamic = "force-dynamic"

const Body = z.object({
  channel: z.enum(["SMS", "EMAIL"]),
  to: z.string().trim().min(3).max(120),
  kind: z.enum(["CONFIRMATION", "REMINDER_DAY_BEFORE", "REMINDER_HOURS_BEFORE", "RESCHEDULED", "CANCELLED"]).default("REMINDER_DAY_BEFORE"),
})

// ── POST /api/settings/agenda/test — send a sample reminder to yourself ───────
// Uses the saved templates with a sample appointment tomorrow at 10:30. Admin only.

export async function POST(req: NextRequest) {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Give channel (SMS/EMAIL) and to" }, { status: 400 })
  const { channel, to, kind } = parsed.data
  const settings = await getClinicSettings()
  const start = new Date(Date.now() + 24 * 3_600_000)
  start.setUTCMinutes(30, 0, 0)
  const ctx: MessageContext = {
    appointmentId: "sample",
    startTime: start,
    endTime: new Date(start.getTime() + 30 * 60_000),
    patientFirstName: guard.user.firstName || "Maria",
    providerName: settings.providers.find((p) => p.active)?.name ?? null,
    link: `${publicBaseUrl()}/c/EXEMPLO12345`,
    icsLink: `${publicBaseUrl()}/c/EXEMPLO12345/ics`,
    settings,
  }
  if (channel === "SMS") {
    const phone = toE164(to)
    if (!phone) return NextResponse.json({ error: "Invalid phone number" }, { status: 400 })
    const r = await defaultSenders.sms(phone, `[TESTE] ${renderSms(kind, ctx)}`, undefined)
    return NextResponse.json(r.ok ? { ok: true, id: r.id } : { ok: false, error: r.error }, { status: r.ok ? 200 : 502 })
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return NextResponse.json({ error: "Invalid email" }, { status: 400 })
  const m = renderEmail(kind, ctx)
  const r = await defaultSenders.email(to, `[TESTE] ${m.subject}`, m.html, m.text)
  return NextResponse.json(r.ok ? { ok: true } : { ok: false, error: r.error }, { status: r.ok ? 200 : 502 })
}
