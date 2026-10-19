import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requestMeta, requireStaff } from "@/lib/auth/guards"
import { isAllowedRecordingUrl, isPlaybackStart, parseRangeHeader } from "@/lib/voice/recordingProxy"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

// ── GET /api/call-logs/[id]/recording ─────────────────────────────────────────
// Streams the call recording through the CRM. The provider URL never reaches
// the browser; the staff session is checked and each playback is audited.
// Every request carrying a Range header is answered with 206 (Safari/iOS).

export async function GET(req: NextRequest, { params }: RouteContext) {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const { id } = await params

  const callLog = await prisma.callLog.findUnique({ where: { id }, select: { id: true, recordingUrl: true } })
  if (!callLog?.recordingUrl) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 })
  }
  if (!isAllowedRecordingUrl(callLog.recordingUrl)) {
    const host = (() => { try { return new URL(callLog.recordingUrl!).hostname } catch { return "invalid URL" } })()
    console.error(`[recording] host not allowlisted: ${host}`)
    return NextResponse.json(
      { error: `Recording host "${host}" is not on the allowlist. An admin can add it to VOICE_RECORDING_HOSTS.` },
      { status: 502 },
    )
  }

  const range = req.headers.get("range")

  if (isPlaybackStart(range)) {
    prisma.auditLog.create({
      data: {
        userId: guard.user.id,
        action: "READ",
        entity: "call_recording",
        entityId: id,
        ...requestMeta(req),
        timestamp: new Date(),
      },
    }).catch(() => {})
  }

  let upstream: Response
  try {
    upstream = await fetch(callLog.recordingUrl, {
      headers: range ? { Range: range } : {},
      redirect: "follow",
      cache: "no-store",
    })
  } catch (err) {
    console.error("[recording] upstream fetch failed:", (err as Error).message)
    return NextResponse.json({ error: "Recording provider unreachable" }, { status: 502 })
  }

  if (!upstream.ok && upstream.status !== 206) {
    if (upstream.status === 416) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": upstream.headers.get("content-range") ?? "bytes */*" } })
    }
    return NextResponse.json({ error: `Recording provider returned ${upstream.status}` }, { status: 502 })
  }

  const contentType = upstream.headers.get("content-type") ?? "audio/wav"
  const baseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  }

  // Upstream honoured the range — pass it through.
  if (upstream.status === 206) {
    const headers = { ...baseHeaders }
    const cr = upstream.headers.get("content-range")
    const cl = upstream.headers.get("content-length")
    if (cr) headers["Content-Range"] = cr
    if (cl) headers["Content-Length"] = cl
    return new NextResponse(upstream.body, { status: 206, headers })
  }

  // No range requested — stream the whole file.
  if (!range) {
    const headers = { ...baseHeaders }
    const cl = upstream.headers.get("content-length")
    if (cl) headers["Content-Length"] = cl
    return new NextResponse(upstream.body, { status: 200, headers })
  }

  // Range requested but upstream sent the full file: slice it ourselves so Safari still gets a 206.
  const buf = new Uint8Array(await upstream.arrayBuffer())
  const parsed = parseRangeHeader(range, buf.byteLength)
  if (parsed === "unsatisfiable") {
    return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${buf.byteLength}` } })
  }
  const { start, end } = parsed ?? { start: 0, end: buf.byteLength - 1 }
  const chunk = buf.slice(start, end + 1)
  return new NextResponse(chunk, {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Range": `bytes ${start}-${end}/${buf.byteLength}`,
      "Content-Length": String(chunk.byteLength),
    },
  })
}
