/**
 * POST /api/webhooks/vapi/test
 * Fires a synthetic Vapi end-of-call-report so you can verify the chat log
 * pipeline without needing a live Vapi session.
 * Requires an active admin session.
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { processVapiEndOfCall } from "@/app/api/webhooks/vapi/route"
import { randomUUID } from "crypto"

// Canned scenarios — one is chosen at random each call so you can run the test
// multiple times without hitting the sessionId uniqueness constraint.
const SCENARIOS = [
  {
    label: "Appointment booking",
    call: {
      id:         "",           // filled in at runtime
      type:       "webCall" as const,
      customer:   { name: "Sarah Johnson", email: "sarah.j@example.com" },
      startedAt:  "",           // filled in at runtime
      endedAt:    "",
    },
    transcript: `Assistant: Hello! Welcome to Kids First Pediatrics. How can I help you today?
User: Hi, I'd like to schedule a well-child visit for my 4-year-old daughter.
Assistant: Of course! We have openings next Tuesday at 9 AM or 2 PM. Which works better?
User: 9 AM works great.
Assistant: Perfect — I've booked a well-child visit for Tuesday at 9 AM. You'll get a confirmation email shortly.
User: Thank you! Goodbye.
Assistant: Goodbye! We look forward to seeing you.`,
    summary:    "Parent scheduled a well-child visit for her 4-year-old daughter. Appointment confirmed for next Tuesday at 9 AM.",
    endedReason: "customer-ended-call",
  },
  {
    label: "Insurance inquiry",
    call: {
      id:         "",
      type:       "webCall" as const,
      customer:   { name: "Marcus Rivera" },
      startedAt:  "",
      endedAt:    "",
    },
    transcript: `Assistant: Hello! How can I help you today?
User: I wanted to know if you accept Medicaid for pediatric visits.
Assistant: Yes, we accept Medicaid, CHIP, and most major insurance plans. Would you like to verify your specific plan?
User: No, that's enough information. Thank you.
Assistant: You're welcome! Feel free to call us if you need anything else.`,
    summary:    "Caller asked whether the practice accepts Medicaid. Confirmed yes. No appointment booked.",
    endedReason: "customer-ended-call",
  },
  {
    label: "After-hours abandoned",
    call: {
      id:         "",
      type:       "webCall" as const,
      customer:   {},
      startedAt:  "",
      endedAt:    "",
    },
    transcript: `Assistant: Hello! Welcome to Kids First Pediatrics.`,
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
