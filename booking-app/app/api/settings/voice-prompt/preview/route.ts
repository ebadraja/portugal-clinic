import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth/guards"
import { checkTemplates, renderForNow } from "@/lib/voice/promptEditor"

export const dynamic = "force-dynamic"

// ── POST /api/settings/voice-prompt/preview — the unsaved texts as a call starting now would get them ──

export async function POST(req: NextRequest) {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const body = await req.json().catch(() => null)
  if (!body || typeof body.prompt !== "string" || typeof body.firstMessage !== "string") {
    return NextResponse.json({ error: "prompt and firstMessage are required" }, { status: 400 })
  }
  try {
    const rendered = await renderForNow(body.prompt, body.firstMessage)
    return NextResponse.json({ prompt: rendered.prompt, firstMessage: rendered.firstMessage, check: checkTemplates(body.prompt, body.firstMessage, rendered) })
  } catch (error) {
    console.error("[POST /api/settings/voice-prompt/preview]", error)
    return NextResponse.json({ error: "Failed to build the preview" }, { status: 500 })
  }
}
