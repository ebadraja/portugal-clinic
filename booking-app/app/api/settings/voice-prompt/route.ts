import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth/guards"
import { getPromptEditorState, savePrompt } from "@/lib/voice/promptEditor"

export const dynamic = "force-dynamic"

// ── /api/settings/voice-prompt — Acácia's prompt and first message (admin only) ──
// GET: current texts, built-in texts, variables with today's values, version history.
// PUT: { prompt, firstMessage, note? } — refused (422) with the reasons when a check fails.

export async function GET() {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  try {
    return NextResponse.json(await getPromptEditorState())
  } catch (error) {
    console.error("[GET /api/settings/voice-prompt]", error)
    return NextResponse.json({ error: "Failed to load the prompt" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const body = await req.json().catch(() => null)
  if (!body || typeof body.prompt !== "string" || typeof body.firstMessage !== "string") {
    return NextResponse.json({ error: "prompt and firstMessage are required" }, { status: 400 })
  }
  try {
    const result = await savePrompt({
      prompt: body.prompt,
      firstMessage: body.firstMessage,
      note: typeof body.note === "string" ? body.note : null,
      user: guard.user,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.check.errors.join(" "), check: result.check }, { status: 422 })
    }
    return NextResponse.json(await getPromptEditorState())
  } catch (error) {
    console.error("[PUT /api/settings/voice-prompt]", error)
    return NextResponse.json({ error: "Failed to save the prompt" }, { status: 500 })
  }
}
