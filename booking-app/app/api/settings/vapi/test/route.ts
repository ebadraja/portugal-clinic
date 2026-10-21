import { NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth/guards"
import prisma from "@/lib/prisma"
import { getVapiConfig, snapshotOf, vapiErrorMessage, vapiFetch } from "@/lib/voice/vapiApi"

export const dynamic = "force-dynamic"

type Check = { label: string; ok: boolean; detail: string }
type Assistant = { id: string; name?: string; model?: { provider?: string; model?: string }; voice?: { provider?: string; voiceId?: string }; transcriber?: { provider?: string; model?: string; language?: string } }
type PhoneNumber = { id: string; number?: string; name?: string; assistantId?: string | null; squadId?: string | null; server?: { url?: string } | null; serverUrl?: string | null }

// ── POST /api/settings/vapi/test — does the saved key work; what do the assistant and number look like? ──
// Also lists the workspace's assistants and phone numbers (ids + names only) so the right IDs can be picked.

export async function POST() {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const cfg = await getVapiConfig()
  if (!cfg?.apiKey) return NextResponse.json({ checks: [{ label: "API key", ok: false, detail: "No API key saved yet." }], assistants: [], phoneNumbers: [] })
  const checks: Check[] = []
  try {
    const [as, ps] = await Promise.all([
      vapiFetch<Assistant[]>("/assistant?limit=100", cfg.apiKey),
      vapiFetch<PhoneNumber[]>("/phone-number?limit=100", cfg.apiKey),
    ])
    if (!as.ok) {
      checks.push({ label: "API key", ok: false, detail: as.status === 401 || as.status === 403 ? "Vapi refused the key. Use the PRIVATE key from Vapi → Organization → API Keys (not the public one)." : vapiErrorMessage(as, "Vapi did not answer") })
      return NextResponse.json({ checks, assistants: [], phoneNumbers: [] })
    }
    const assistants = (Array.isArray(as.json) ? as.json : []).map((a) => ({ id: a.id, name: a.name ?? "(no name)" }))
    const phones = (Array.isArray(ps.json) ? ps.json : []).map((p) => ({ id: p.id, number: p.number ?? "", name: p.name ?? "", assistantId: p.assistantId ?? null, serverUrl: p.server?.url ?? p.serverUrl ?? null }))
    checks.push({ label: "API key", ok: true, detail: `Connected — ${assistants.length} assistant(s) and ${phones.length} phone number(s) in this Vapi workspace.` })

    if (cfg.assistantId) {
      const a = await vapiFetch<Assistant>(`/assistant/${encodeURIComponent(cfg.assistantId)}`, cfg.apiKey)
      // Keep a copy of how Acácia sounds, so the CRM-built assistant uses the same voice and transcriber.
      if (a.ok && a.json) await prisma.settings.updateMany({ data: { vapiAssistantSnapshot: { ...snapshotOf(a.json), phoneNumber: cfg.snapshot?.phoneNumber ?? null } as object } })
      checks.push(a.ok
        ? { label: "Assistant", ok: true, detail: `"${a.json?.name ?? cfg.assistantId}" · ${a.json?.model?.provider ?? "?"}/${a.json?.model?.model ?? "?"} · voice ${a.json?.voice?.provider ?? "?"} ${a.json?.voice?.voiceId ?? ""} · transcriber ${a.json?.transcriber?.provider ?? "?"} ${a.json?.transcriber?.model ?? ""} ${a.json?.transcriber?.language ?? ""}`.trim() }
        : { label: "Assistant", ok: false, detail: a.status === 404 ? "No assistant with this ID in the workspace of this key." : vapiErrorMessage(a, "Could not read the assistant") })
    } else {
      checks.push({ label: "Assistant", ok: false, detail: "Add Acácia's assistant ID (pick it from the list below) so the CRM can copy her voice settings." })
    }

    if (cfg.phoneNumberId) {
      const p = phones.find((x) => x.id === cfg.phoneNumberId)
      if (p?.number) {
        const fresh = await prisma.settings.findFirst({ select: { vapiAssistantSnapshot: true } })
        await prisma.settings.updateMany({ data: { vapiAssistantSnapshot: { ...((fresh?.vapiAssistantSnapshot as object | null) ?? {}), phoneNumber: p.number } } })
      }
      checks.push(p
        ? { label: "Phone number", ok: true, detail: `${p.number || p.name || p.id} · ${p.assistantId ? `answered by assistant ${assistants.find((a) => a.id === p.assistantId)?.name ?? p.assistantId}` : p.serverUrl ? `asks ${p.serverUrl} for its assistant` : "no assistant set"}` }
        : { label: "Phone number", ok: false, detail: "No phone number with this ID in the workspace of this key." })
    } else {
      checks.push({ label: "Phone number", ok: false, detail: "Add the clinic number's ID (pick it from the list below)." })
    }
    return NextResponse.json({ checks, assistants, phoneNumbers: phones })
  } catch (error) {
    console.error("[POST /api/settings/vapi/test]", (error as Error).message)
    checks.push({ label: "Connection", ok: false, detail: "Could not reach Vapi from the server. Try again in a minute." })
    return NextResponse.json({ checks, assistants: [], phoneNumbers: [] })
  }
}
