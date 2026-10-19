import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { runDispatch } from "@/lib/appointments/dispatch"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// ── GET /api/cron/dispatch — send due appointment messages ────────────────────
// Triggered by cron-job.org (every 10 min, clinic hours) and a daily Vercel Cron.
// Auth: `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it automatically).
// Fails closed: without CRON_SECRET configured nothing runs.

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 })
  }
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const result = await runDispatch()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error("[GET /api/cron/dispatch]", error)
    return NextResponse.json({ error: "Dispatch failed" }, { status: 500 })
  }
}

export const POST = GET
