import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { requestMeta, requireStaff } from "@/lib/auth/guards"
import { ensureSettingsRow } from "@/lib/clinic/settingsWrite"

export const dynamic = "force-dynamic"

const SELECT = { vapiApiKey: true, vapiAssistantId: true, vapiPhoneNumberId: true, vapiLastSync: true } as const

function shape(s: { vapiApiKey: string | null; vapiAssistantId: string | null; vapiPhoneNumberId: string | null; vapiLastSync: Date | null } | null) {
  // Never send the key to the browser, in any form.
  return { hasApiKey: !!s?.vapiApiKey, assistantId: s?.vapiAssistantId ?? "", phoneNumberId: s?.vapiPhoneNumberId ?? "", lastSync: s?.vapiLastSync ?? null }
}

// ── GET /api/settings/vapi — connection status (admin) ────────────────────────

export async function GET() {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  try {
    return NextResponse.json(shape(await prisma.settings.findFirst({ select: SELECT })))
  } catch (error) {
    console.error("[GET /api/settings/vapi]", error)
    return NextResponse.json({ error: "Failed to load the Vapi settings" }, { status: 500 })
  }
}

const Id = z.string().trim().max(80).regex(/^[A-Za-z0-9-]*$/, "That ID doesn't look like a Vapi ID (letters, numbers and dashes)")
const Put = z.object({ apiKey: z.string().trim().max(200).optional(), clearApiKey: z.boolean().optional(), assistantId: Id.optional(), phoneNumberId: Id.optional() }).strict()

// ── PUT /api/settings/vapi — save (admin, audited without the key). Blank apiKey keeps the stored one. ──

export async function PUT(req: NextRequest) {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const parsed = Put.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 })
  const b = parsed.data
  if (b.apiKey && b.apiKey.length < 20) return NextResponse.json({ error: "That doesn't look like a Vapi private API key" }, { status: 400 })
  try {
    const { id } = await ensureSettingsRow()
    const data: Record<string, unknown> = { vapiLastSync: new Date() }
    if (b.clearApiKey) data.vapiApiKey = null
    else if (b.apiKey) data.vapiApiKey = encrypt(b.apiKey)
    if (b.assistantId !== undefined) data.vapiAssistantId = b.assistantId || null
    if (b.phoneNumberId !== undefined) data.vapiPhoneNumberId = b.phoneNumberId || null
    const s = await prisma.settings.update({ where: { id }, data, select: SELECT })
    await prisma.auditLog.create({
      data: {
        userId: guard.user.id, action: "UPDATE", entity: "settings", entityId: "vapi",
        changes: { keyChanged: !!b.apiKey || !!b.clearApiKey, assistantId: s.vapiAssistantId, phoneNumberId: s.vapiPhoneNumberId },
        ...requestMeta(req), timestamp: new Date(),
      },
    })
    return NextResponse.json(shape(s))
  } catch (error) {
    console.error("[PUT /api/settings/vapi]", error)
    return NextResponse.json({ error: "Failed to save the Vapi settings" }, { status: 500 })
  }
}
