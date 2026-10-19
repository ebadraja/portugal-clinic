import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@/lib/generated/prisma/client"
import prisma from "@/lib/prisma"
import { requestMeta, requireStaff } from "@/lib/auth/guards"
import { toAuditCsv } from "@/lib/audit/csv"

export const dynamic = "force-dynamic"

const ACTIONS = new Set(["CREATE", "READ", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "MESSAGE_SENT", "MESSAGE_READ", "CONVERSATION_ASSIGNED", "CONVERSATION_RESOLVED", "PORTAL_ACCESS", "BROADCAST_SENT"])
const CSV_CAP = 10_000

// ── GET /api/audit-logs ── admin only; read-only, never purged ────────────────
// Filters: action, entity, userId, from, to (YYYY-MM-DD), page, limit; format=csv exports.

export async function GET(req: NextRequest) {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const q = req.nextUrl.searchParams

  const where: Prisma.AuditLogWhereInput = {}
  const action = q.get("action")
  if (action && ACTIONS.has(action)) where.action = action as Prisma.AuditLogWhereInput["action"]
  const entity = q.get("entity")
  if (entity) where.entity = entity.slice(0, 60)
  const userId = q.get("userId")
  if (userId) where.userId = userId
  const from = q.get("from")
  const to = q.get("to")
  if ((from && /^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && /^\d{4}-\d{2}-\d{2}$/.test(to))) {
    where.timestamp = {
      ...(from && /^\d{4}-\d{2}-\d{2}$/.test(from) && { gte: new Date(`${from}T00:00:00Z`) }),
      ...(to && /^\d{4}-\d{2}-\d{2}$/.test(to) && { lt: new Date(new Date(`${to}T00:00:00Z`).getTime() + 86_400_000) }),
    }
  }

  const include = { user: { select: { firstName: true, lastName: true, email: true } } } as const

  if (q.get("format") === "csv") {
    const rows = await prisma.auditLog.findMany({ where, include, orderBy: { timestamp: "desc" }, take: CSV_CAP })
    await prisma.auditLog.create({
      data: { userId: guard.user.id, action: "READ", entity: "audit_log", changes: { export: "csv", rows: rows.length, filters: { action, entity, userId, from, to } }, ...requestMeta(req), timestamp: new Date() },
    })
    return new NextResponse(toAuditCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    })
  }

  const page = Math.max(1, parseInt(q.get("page") ?? "1", 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(q.get("limit") ?? "25", 10) || 25))
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, include, orderBy: { timestamp: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.auditLog.count({ where }),
  ])
  return NextResponse.json({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }, csvCap: CSV_CAP })
}
