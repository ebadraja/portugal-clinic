import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requestMeta, requireStaff } from "@/lib/auth/guards"
import { getVapiConfig } from "@/lib/voice/vapiApi"
import { runVapiSetup } from "@/lib/voice/vapiSetup"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// ── POST /api/settings/vapi/setup — copy the voice, create the structured output and the preview assistant ──

export async function POST(req: NextRequest) {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const cfg = await getVapiConfig()
  if (!cfg?.apiKey) return NextResponse.json({ ok: false, steps: [{ step: "API key", ok: false, detail: "Save the Vapi private key first." }] })
  try {
    const result = await runVapiSetup(cfg)
    await prisma.auditLog.create({
      data: { userId: guard.user.id, action: "UPDATE", entity: "settings", entityId: "vapi_setup", changes: { steps: result.steps.map((s) => `${s.step}:${s.ok}`) }, ...requestMeta(req), timestamp: new Date() },
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error("[POST /api/settings/vapi/setup]", (error as Error).message)
    return NextResponse.json({ ok: false, steps: [{ step: "Connection", ok: false, detail: "Could not reach Vapi from the server. Try again in a minute." }] })
  }
}
