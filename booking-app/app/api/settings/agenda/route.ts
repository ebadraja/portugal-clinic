import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { requestMeta, requireStaff } from "@/lib/auth/guards"
import { DEFAULT_SMS_TEMPLATES, ReminderPolicySchema, getClinicSettings } from "@/lib/clinic/settings"
import { updateSettingsAudited } from "@/lib/clinic/settingsWrite"
import { MERGE_TAGS } from "@/lib/appointments/messages"
import { cancelAllPending, replanUpcoming } from "@/lib/appointments/replan"

export const dynamic = "force-dynamic"

async function snapshot() {
  const settings = await getClinicSettings()
  const row = await prisma.settings.findFirst({ select: { dispatchHeartbeatAt: true } })
  const since = new Date(Date.now() - 7 * 24 * 3_600_000)
  const [pending, sent7d, failed7d] = await Promise.all([
    prisma.appointmentNotification.count({ where: { status: "PENDING" } }),
    prisma.appointmentNotification.count({ where: { status: "SENT", sentAt: { gte: since } } }),
    prisma.appointmentNotification.count({ where: { OR: [{ status: "FAILED" }, { deliveryStatus: { in: ["failed", "undelivered"] } }], updatedAt: { gte: since } } }),
  ])
  return {
    flags: settings.flags,
    reminderPolicy: settings.reminderPolicy,
    defaults: { smsTemplates: DEFAULT_SMS_TEMPLATES },
    mergeTags: MERGE_TAGS,
    practice: settings.practice,
    status: {
      dispatchHeartbeatAt: row?.dispatchHeartbeatAt?.toISOString() ?? null,
      cronSecretConfigured: !!process.env.CRON_SECRET?.trim(),
      smsConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER),
      pending,
      sent7d,
      failed7d,
    },
  }
}

// ── GET /api/settings/agenda — feature flags, reminder policy, outbox health ──

export async function GET() {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  try {
    return NextResponse.json(await snapshot())
  } catch (error) {
    console.error("[GET /api/settings/agenda]", error)
    return NextResponse.json({ error: "Failed to load agenda settings" }, { status: 500 })
  }
}

const PatchSchema = z
  .object({
    agendaV2Enabled: z.boolean(),
    remindersEnabled: z.boolean(),
    reminderPolicy: ReminderPolicySchema,
  })
  .partial()
  .strict()

// ── PATCH /api/settings/agenda — admin only ──────────────────────────────────
// Switching reminders on plans reminders for every upcoming appointment; switching them
// off cancels everything still pending. Saving a new policy re-plans upcoming reminders.

export async function PATCH(req: NextRequest) {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: `${issue?.path.join(".") || "body"}: ${issue?.message ?? "invalid"}` }, { status: 400 })
  }
  const body = parsed.data
  try {
    const before = await getClinicSettings()
    await updateSettingsAudited({
      data: {
        ...(body.agendaV2Enabled !== undefined && { agendaV2Enabled: body.agendaV2Enabled }),
        ...(body.remindersEnabled !== undefined && { remindersEnabled: body.remindersEnabled }),
        ...(body.reminderPolicy !== undefined && { reminderPolicy: body.reminderPolicy }),
      },
      userId: guard.user.id,
      section: Object.keys(body).join(","),
      ...requestMeta(req),
    })
    const after = await getClinicSettings()
    let replanned: { appointments: number; messages: number } | null = null
    let cancelled = 0
    if (before.flags.reminders && !after.flags.reminders) {
      cancelled = await cancelAllPending()
    } else if (after.flags.reminders && (!before.flags.reminders || body.reminderPolicy !== undefined)) {
      replanned = await replanUpcoming(after)
    }
    return NextResponse.json({ ...(await snapshot()), replanned, cancelled })
  } catch (error) {
    console.error("[PATCH /api/settings/agenda]", error)
    return NextResponse.json({ error: "Failed to save agenda settings" }, { status: 500 })
  }
}
