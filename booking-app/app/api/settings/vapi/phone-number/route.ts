import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { requestMeta, requireStaff } from "@/lib/auth/guards"
import { getVapiConfig } from "@/lib/voice/vapiApi"
import { pointPhoneNumber } from "@/lib/voice/vapiSetup"

export const dynamic = "force-dynamic"

const Body = z.object({ target: z.enum(["crm", "saved"]) }).strict()

// ── POST /api/settings/vapi/phone-number { target: "crm" | "saved" } — who the clinic number asks ──

export async function POST(req: NextRequest) {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Choose crm or saved" }, { status: 400 })
  const cfg = await getVapiConfig()
  if (!cfg) return NextResponse.json({ step: "Phone number", ok: false, detail: "Save the Vapi connection first." })
  try {
    const step = await pointPhoneNumber(cfg, parsed.data.target)
    await prisma.auditLog.create({
      data: { userId: guard.user.id, action: "UPDATE", entity: "settings", entityId: "vapi_phone_number", changes: { target: parsed.data.target, ok: step.ok }, ...requestMeta(req), timestamp: new Date() },
    })
    return NextResponse.json(step)
  } catch (error) {
    console.error("[POST /api/settings/vapi/phone-number]", (error as Error).message)
    return NextResponse.json({ step: "Phone number", ok: false, detail: "Could not reach Vapi from the server. Try again in a minute." })
  }
}
