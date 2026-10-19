import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireStaff } from "@/lib/auth/guards"
import { checkPromptClauses } from "@/lib/voice/contract"

const Body = z.object({ prompt: z.string().max(100_000) })

// ── POST /api/settings/voice-agent/check-prompt ───────────────────────────────
// Checks a system prompt (pasted from Vapi) for the clauses this clinic requires:
// AI + recording disclosure, identity verification, no clinical advice,
// urgent-symptom path and the new-patient rule. Nothing is stored.

export async function POST(req: NextRequest) {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Paste the prompt text" }, { status: 400 })
  const clauses = checkPromptClauses(parsed.data.prompt)
  return NextResponse.json({ clauses, allPresent: clauses.every((c) => c.present) })
}
