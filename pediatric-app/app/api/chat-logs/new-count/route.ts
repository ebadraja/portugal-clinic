import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/auth"

export const dynamic = "force-dynamic"

// ── GET /api/chat-logs/new-count?since=<ISO> ──────────────────────────────────
// Count of chat logs that arrived after the `since` timestamp (the time the
// staff member last opened the Chat Logs tab). Powers the sidebar "new" badge.
// Read-only. Missing/invalid `since` defaults to "now" (clean slate).

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const sinceParam = request.nextUrl.searchParams.get("since")
    const parsed = sinceParam ? new Date(sinceParam) : new Date()
    const since = isNaN(parsed.getTime()) ? new Date() : parsed

    const count = await prisma.chatLog.count({
      where: { createdAt: { gt: since } },
    })

    return NextResponse.json({ count })
  } catch (error) {
    console.error("[GET /api/chat-logs/new-count]", error)
    return NextResponse.json({ error: "Failed to fetch count" }, { status: 500 })
  }
}
