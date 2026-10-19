import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { clientKey, rateLimit } from "@/lib/auth/rateLimit"
import { getClinicSettings } from "@/lib/clinic/settings"
import { TOKEN_RE, applyLinkAction } from "@/lib/appointments/patientLink"
import { kickDispatch } from "@/lib/appointments/dispatch"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ token: string }> }

const Body = z.object({ action: z.enum(["confirm", "cancel", "reschedule"]) })

// ── POST /api/public/appointment/[token] — patient confirms / cancels / asks to reschedule ──
// Public (token-scoped). Rate-limited per client and per token.

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { token } = await params
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: "Ligação inválida." }, { status: 404 })
  const byClient = rateLimit(`plink:ip:${clientKey(req)}`, 30, 10 * 60_000)
  const byToken = rateLimit(`plink:t:${token}`, 10, 10 * 60_000)
  if (!byClient.ok || !byToken.ok) {
    return NextResponse.json({ error: "Demasiados pedidos. Tente daqui a pouco." }, { status: 429 })
  }
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 })
  try {
    const r = await applyLinkAction(token, parsed.data.action, await getClinicSettings())
    if (r.ok) void kickDispatch()
    return NextResponse.json(r, { status: r.ok ? 200 : 409 })
  } catch (error) {
    console.error("[POST /api/public/appointment/[token]]", error)
    return NextResponse.json({ error: "Não foi possível concluir. Ligue-nos, por favor." }, { status: 500 })
  }
}
