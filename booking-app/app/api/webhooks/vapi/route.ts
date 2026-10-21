import { NextRequest, NextResponse } from "next/server"
import { verifyVapiRequest } from "@/lib/voice/webhookAuth"
import { recordWebhookEvent } from "@/lib/voice/webhookLog"
import { processVapiEndOfCall, type VapiArtifact, type VapiCall, type VapiEndOfCallReport, type VapiMessage, type VapiAnalysis } from "@/lib/voice/endOfCall"
import { runVoiceTool, type ToolContext } from "@/lib/voice/tools"
import { getClinicSettings } from "@/lib/clinic/settings"
import { answerAssistantRequest } from "@/lib/voice/assistantRequest"

export const dynamic = "force-dynamic"

// Vapi uses an OpenAI-compatible format: name + arguments are nested under "function",
// and arguments is usually a JSON-encoded string.
interface VapiToolCall {
  id: string
  type?: string
  function: { name: string; arguments: string | Record<string, unknown> }
}

const GENERIC_TOOL_FAILURE = "Ocorreu um problema técnico. Peça desculpa e ofereça um pedido de chamada de volta ou a transferência para a receção."

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>
  if (typeof raw !== "string") return {}
  try {
    const v = JSON.parse(raw)
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

// ─── POST /api/webhooks/vapi ───────────────────────────────────────────────────
// HIPAA/GDPR: never log the body — it carries transcripts and patient details.
// Only event type, call id and outcome are logged and stored.

export async function POST(request: NextRequest) {
  const verdict = verifyVapiRequest(request.headers)
  if (!verdict.ok) {
    recordWebhookEvent({ eventType: "unknown", outcome: "rejected", reason: verdict.reason })
    console.warn(`[vapi] rejected delivery: ${verdict.reason}`)
    return NextResponse.json({ error: verdict.status === 503 ? "Webhook secret not configured" : "Unauthorized" }, { status: verdict.status })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    recordWebhookEvent({ eventType: "unknown", outcome: "rejected", reason: "invalid_json" })
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const msg = body?.message as Record<string, unknown> | undefined
  const payload = msg ?? body
  const type = typeof payload?.type === "string" ? payload.type : "unknown"
  const call = payload?.call as VapiCall | undefined
  const callId = call?.id ?? (typeof payload?.sessionId === "string" ? payload.sessionId : null)
  console.log(`[vapi] event=${type} call=${callId ?? "-"}`)

  // ── Inbound call on a number without a fixed assistant: the CRM decides who answers ──
  if (type === "assistant-request") {
    const answer = await answerAssistantRequest(call?.customer?.number ?? null)
    recordWebhookEvent({ eventType: type, callId, outcome: answer.kind === "error" ? "error" : "processed", reason: answer.kind })
    return NextResponse.json(answer.body)
  }

  // ── End of a call / web conversation ───────────────────────────────────────
  if (type === "conversation-update" || type === "end-of-call-report") {
    if (!callId) {
      recordWebhookEvent({ eventType: type, outcome: "rejected", reason: "missing_call_id" })
      return NextResponse.json({ error: "Missing call id" }, { status: 400 })
    }
    if (type === "conversation-update") {
      const status = typeof payload?.status === "string" ? payload.status : ""
      if (status !== "ended" && status !== "complete") {
        return NextResponse.json({ received: true, processed: false, reason: "conversation still in progress" })
      }
    }

    const report: VapiEndOfCallReport = {
      type: "end-of-call-report",
      call: call ?? { id: callId },
      transcript: payload?.transcript as string | undefined,
      summary: payload?.summary as string | undefined,
      messages: payload?.messages as VapiMessage[] | undefined,
      endedReason: payload?.endedReason as string | undefined,
      artifact: payload?.artifact as VapiArtifact | undefined,
      recordingUrl: payload?.recordingUrl as string | undefined,
      analysis: payload?.analysis as VapiAnalysis | undefined,
      startedAt: payload?.startedAt as string | undefined,
      endedAt: payload?.endedAt as string | undefined,
    }

    try {
      const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? null
      const result = await processVapiEndOfCall(report, ip, type === "end-of-call-report")
      if (result.alreadyExists) {
        recordWebhookEvent({ eventType: type, callId, outcome: "duplicate" })
        return NextResponse.json({ received: true, processed: false, reason: "duplicate", chatLogId: result.chatLogId, callLogId: result.callLogId })
      }
      recordWebhookEvent({ eventType: type, callId, outcome: "processed" })
      return NextResponse.json({ received: true, processed: true, chatLogId: result.chatLogId, callLogId: result.callLogId }, { status: 201 })
    } catch (err) {
      console.error(`[vapi] processing failed for call=${callId}:`, (err as Error).message)
      recordWebhookEvent({ eventType: type, callId, outcome: "error", reason: (err as Error).message })
      // 500 lets Vapi retry; the unique call id makes the retry safe.
      return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
    }
  }

  // ── Mid-call tool invocation ───────────────────────────────────────────────
  if (type === "tool-calls") {
    const rawList = payload?.toolCallList
    const toolCallList = Array.isArray(rawList) ? (rawList as VapiToolCall[]) : []

    let ctx: ToolContext
    try {
      ctx = {
        callId,
        callerPhone: call?.customer?.number ?? null,
        settings: await getClinicSettings(),
        now: new Date(),
      }
    } catch (err) {
      console.error("[vapi] settings unavailable for tool-calls:", (err as Error).message)
      recordWebhookEvent({ eventType: type, callId, outcome: "error", reason: "settings_unavailable" })
      return NextResponse.json({ results: toolCallList.map((tc) => ({ toolCallId: tc.id, result: GENERIC_TOOL_FAILURE })) })
    }

    const names: string[] = []
    const results = await Promise.all(
      toolCallList.map(async (tc) => {
        const name = tc.function?.name ?? "unknown"
        names.push(name)
        try {
          return { toolCallId: tc.id, result: await runVoiceTool(name, parseArgs(tc.function?.arguments), ctx) }
        } catch (err) {
          console.error(`[vapi] tool ${name} failed for call=${callId ?? "-"}:`, (err as Error).message)
          return { toolCallId: tc.id, result: GENERIC_TOOL_FAILURE }
        }
      }),
    )
    recordWebhookEvent({ eventType: type, callId, outcome: "processed", reason: names.join(",") })
    return NextResponse.json({ results })
  }

  // Informational events (status/speech/transcript updates) are acknowledged but not stored.
  return NextResponse.json({ received: true, processed: false, type })
}

// ─── GET /api/webhooks/vapi (health check) ────────────────────────────────────

export async function GET() {
  return NextResponse.json({ status: "Vapi webhook receiver is active", timestamp: new Date().toISOString() })
}
