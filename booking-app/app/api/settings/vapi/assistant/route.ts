import { NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth/guards"
import { getClinicSettings } from "@/lib/clinic/settings"
import { appBaseUrl } from "@/lib/auth/passwordTokens"
import { getVapiConfig } from "@/lib/voice/vapiApi"
import { PROMPT_VERSION, buildTransientAssistant, redactAssistant } from "@/lib/voice/transientAssistant"

export const dynamic = "force-dynamic"

// ── GET /api/settings/vapi/assistant — exactly what a call would get right now (secret masked) ──

export async function GET() {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  try {
    const [settings, cfg] = await Promise.all([getClinicSettings(), getVapiConfig()])
    const assistant = buildTransientAssistant({
      settings, now: new Date(), baseUrl: appBaseUrl(), webhookSecret: process.env.VAPI_WEBHOOK_SECRET?.trim() ?? "",
      snapshot: cfg?.snapshot, structuredOutputId: cfg?.structuredOutputId,
    })
    const model = assistant.model as { messages: { content: string }[]; tools: { type: string; function?: { name: string } }[]; provider: string; model: string }
    const voice = assistant.voice as { provider?: string; voiceId?: string }
    return NextResponse.json({
      promptVersion: PROMPT_VERSION,
      firstMessage: assistant.firstMessage,
      prompt: model.messages[0]?.content ?? "",
      tools: model.tools.map((t) => t.function?.name ?? t.type),
      model: `${model.provider}/${model.model}`,
      voice: `${voice.provider ?? "?"} ${voice.voiceId ?? ""}`.trim(),
      voiceCopied: !!cfg?.snapshot?.voice,
      assistant: redactAssistant(assistant),
    })
  } catch (error) {
    console.error("[GET /api/settings/vapi/assistant]", error)
    return NextResponse.json({ error: "Failed to build the assistant preview" }, { status: 500 })
  }
}
