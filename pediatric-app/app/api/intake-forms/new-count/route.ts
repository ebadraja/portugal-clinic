import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/auth"

export const dynamic = "force-dynamic"

// ── GET /api/intake-forms/new-count?since=<ISO> ───────────────────────────────
// Count of intake forms received after the `since` timestamp (the time the staff
// member last opened the Intake Forms tab). Counts only still-unprocessed forms
// (status RECEIVED, not soft-deleted). Powers the sidebar "new" badge. Read-only.
// Respects the same view access control as the list endpoint — returns 0 for
// users without intake-form view permission. Missing/invalid `since` => "now".

async function checkAccess(session: any) {
  if (!session?.user?.id) return false
  if (session.user.role === "ADMIN") return true
  const ac = await prisma.intakeFormAccessControl.findUnique({
    where: { userId: session.user.id },
  })
  return !!ac?.canView
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!(await checkAccess(session))) {
      // No view permission — surface no badge rather than an error.
      return NextResponse.json({ count: 0 })
    }

    const sinceParam = request.nextUrl.searchParams.get("since")
    const parsed = sinceParam ? new Date(sinceParam) : new Date()
    const since = isNaN(parsed.getTime()) ? new Date() : parsed

    const count = await prisma.intakeForm.count({
      where: {
        status: "RECEIVED",
        deletedAt: null,
        createdAt: { gt: since },
      },
    })

    return NextResponse.json({ count })
  } catch (error) {
    console.error("[GET /api/intake-forms/new-count]", error)
    return NextResponse.json({ error: "Failed to fetch count" }, { status: 500 })
  }
}
