import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/auth"

export const dynamic = "force-dynamic"

// ── GET /api/call-logs/new-count?since=<ISO> ──────────────────────────────────
// Count of call logs that arrived after the `since` timestamp (the time the
// staff member last opened the Call Logs tab). Powers the sidebar "new" badge.
// Read-only. When `since` is missing/invalid we default to "now" so nothing is
// counted (a brand-new browser starts with a clean slate, not the full backlog).

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const sinceParam = request.nextUrl.searchParams.get("since")
    const parsed = sinceParam ? new Date(sinceParam) : new Date()
    const since = isNaN(parsed.getTime()) ? new Date() : parsed

    const count = await prisma.callLog.count({
      where: { createdAt: { gt: since } },
    })

    return NextResponse.json({ count })
  } catch (error) {
    console.error("[GET /api/call-logs/new-count]", error)
    return NextResponse.json({ error: "Failed to fetch count" }, { status: 500 })
  }
}
