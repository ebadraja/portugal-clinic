/**
 * POST /api/webhooks/vapi/test
 * Fires a synthetic Vapi end-of-call-report so you can verify the chat log
 * pipeline without needing a live Vapi session.
 * Requires an active admin session.
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { processVapiEndOfCall } from "@/lib/voice/endOfCall"
import { randomUUID } from "crypto"

// Canned scenarios — one is chosen at random each call so you can run the test
// multiple times without hitting the sessionId uniqueness constraint.
const SCENARIOS = [
  {
    label: "Pergunta sobre seguros",
    call: {
      id:         "",           // filled in at runtime
      type:       "webCall" as const,
      customer:   { name: "Marta Ferreira", email: "marta.ferreira@example.com" },
      startedAt:  "",           // filled in at runtime
      endedAt:    "",
    },
    transcript: `Assistant: Clínica Dentária Nunes Monteiro, fala a Acácia, assistente virtual. Em que posso ajudar?
User: Boa tarde. Queria saber se trabalham com a AdvanceCare.
Assistant: Sim, trabalhamos com a AdvanceCare. A cobertura de cada tratamento é confirmada pela receção.
User: Obrigada, era só isso.
Assistant: De nada. Bom dia!`,
    summary:    "A pessoa perguntou se a clínica trabalha com a AdvanceCare. Foi confirmado. Nenhuma consulta marcada.",
    endedReason: "customer-ended-call",
  },
  {
    label: "Novo paciente — pedido de chamada",
    call: {
      id:         "",
      type:       "webCall" as const,
      customer:   { name: "Rui Costa" },
      startedAt:  "",
      endedAt:    "",
    },
    transcript: `Assistant: Clínica Dentária Nunes Monteiro, fala a Acácia, assistente virtual. Em que posso ajudar?
User: Olá, nunca fui aí e gostava de marcar uma consulta de avaliação.
Assistant: Para novos pacientes, a equipa confirma a disponibilidade e liga de volta. Posso registar o pedido?
User: Sim, por favor.
Assistant: Pedido registado. A receção vai ligar-lhe assim que possível.`,
    summary:    "Novo paciente pediu consulta de avaliação. Foi registado um pedido de chamada de volta.",
    endedReason: "customer-ended-call",
  },
  {
    label: "Chamada sem resposta",
    call: {
      id:         "",
      type:       "webCall" as const,
      customer:   {},
      startedAt:  "",
      endedAt:    "",
    },
    transcript: `Assistant: Clínica Dentária Nunes Monteiro, fala a Acácia, assistente virtual.`,
    summary:    "",
    endedReason: "silence-timed-out",
  },
]

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body      = await request.json().catch(() => ({}))
  const scenarioIndex: number = typeof body.scenario === "number"
    ? Math.max(0, Math.min(body.scenario, SCENARIOS.length - 1))
    : Math.floor(Math.random() * SCENARIOS.length)

  const tpl  = SCENARIOS[scenarioIndex]
  const now  = new Date()
  const end  = new Date(now.getTime() + (5 + Math.floor(Math.random() * 8)) * 60_000)

  // Build the synthetic report
  const report = {
    type:       "end-of-call-report" as const,
    endedReason: tpl.endedReason,
    call: {
      ...tpl.call,
      id:        body.sessionId ?? `test_${randomUUID()}`,
      startedAt: now.toISOString(),
      endedAt:   end.toISOString(),
    },
    transcript: tpl.transcript,
    summary:    tpl.summary,
    messages:   tpl.transcript
      .split("\n")
      .filter(Boolean)
      .map((line, i) => {
        const isAssistant = line.startsWith("Assistant:")
        return {
          role:              isAssistant ? "assistant" as const : "user" as const,
          content:           line.replace(/^(Assistant|User):\s*/, "").trim(),
          time:              now.getTime() + i * 8_000,
          secondsFromStart:  i * 8,
        }
      }),
  }

  try {
    const ip     = request.headers.get("x-forwarded-for") ?? null
    const result = await processVapiEndOfCall(report, ip)
    return NextResponse.json({
      success:      true,
      scenario:     tpl.label,
      chatLogId:    result.chatLogId,
      callLogId:    result.callLogId,
      alreadyExists: result.alreadyExists ?? false,
      payload:      report,
    })
  } catch (err) {
    return NextResponse.json({
      success: false,
      error:   err instanceof Error ? err.message : "Unknown error",
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    usage: "POST /api/webhooks/vapi/test",
    body:  { scenario: "0 | 1 | 2  (optional, random if omitted)", sessionId: "string (optional, auto-generated if omitted)" },
    scenarios: SCENARIOS.map((s, i) => ({ index: i, label: s.label })),
  })
}
