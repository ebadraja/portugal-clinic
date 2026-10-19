import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requestMeta, requireStaff } from "@/lib/auth/guards"
import { getClinicSettings } from "@/lib/clinic/settings"
import { updateSettingsAudited } from "@/lib/clinic/settingsWrite"
import { STRUCTURED_OUTPUT_SCHEMA, TOOL_DEFINITIONS } from "@/lib/voice/contract"
import { explainWebhookReason, getVoiceDeliveryStatus } from "@/lib/voice/webhookLog"
import { appBaseUrl } from "@/lib/auth/passwordTokens"

export const dynamic = "force-dynamic"

// ── GET /api/settings/voice-agent ─────────────────────────────────────────────
// What the CRM controls (kill switch, name, transfer number), the exact setup
// to paste into Vapi (generated from lib/voice/contract.ts), and whether
// deliveries are arriving.

export async function GET() {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  try {
    const [settings, delivery] = await Promise.all([getClinicSettings(), getVoiceDeliveryStatus()])
    const secretConfigured = !!process.env.VAPI_WEBHOOK_SECRET?.trim()
    return NextResponse.json({
      paused: settings.voiceAgent.paused,
      name: settings.voiceAgent.name,
      transferPhone: settings.voiceAgent.transferPhone,
      webhookUrl: `${appBaseUrl()}/api/webhooks/vapi`,
      secretConfigured,
      unsignedDevMode: !secretConfigured && process.env.NODE_ENV !== "production" && process.env.VAPI_ALLOW_UNSIGNED === "true",
      delivery: {
        ...delivery,
        recentProblems: delivery.recentProblems.map((p) => ({ ...p, explanation: explainWebhookReason(p.reason) })),
      },
      tools: TOOL_DEFINITIONS.map((t) => ({ type: "function", function: t })),
      structuredOutputSchema: STRUCTURED_OUTPUT_SCHEMA,
    })
  } catch (error) {
    console.error("[GET /api/settings/voice-agent]", error)
    return NextResponse.json({ error: "Failed to load voice agent settings" }, { status: 500 })
  }
}

const Patch = z
  .object({
    paused: z.boolean(),
    name: z.string().trim().min(1).max(40),
    transferPhone: z.string().trim().max(30),
  })
  .partial()
  .strict()

// ── PATCH /api/settings/voice-agent ── admin only, audited ────────────────────

export async function PATCH(req: NextRequest) {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const parsed = Patch.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (parsed.data.paused !== undefined) data.voiceToolsPaused = parsed.data.paused
  if (parsed.data.name !== undefined) data.voiceAgentName = parsed.data.name
  if (parsed.data.transferPhone !== undefined) data.emergencyPhone = parsed.data.transferPhone || null

  try {
    await updateSettingsAudited({ data, userId: guard.user.id, section: "voice_agent", ...requestMeta(req) })
    const s = await getClinicSettings()
    return NextResponse.json({ paused: s.voiceAgent.paused, name: s.voiceAgent.name, transferPhone: s.voiceAgent.transferPhone })
  } catch (error) {
    console.error("[PATCH /api/settings/voice-agent]", error)
    return NextResponse.json({ error: "Failed to save" }, { status: 500 })
  }
}
