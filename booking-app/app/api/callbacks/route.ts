import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma } from "@/lib/generated/prisma/client"
import prisma from "@/lib/prisma"
import { requestMeta, requireStaff } from "@/lib/auth/guards"
import { toE164 } from "@/lib/clinic/phone"

export const dynamic = "force-dynamic"

const INCLUDE = {
  patient: { select: { id: true, firstName: true, lastName: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
} as const

const URGENCY_RANK: Record<string, number> = { URGENT: 0, NORMAL: 1, LOW: 2 }

// ── GET /api/callbacks ────────────────────────────────────────────────────────
// The callback work queue. status=open (default: OPEN + IN_PROGRESS) | done | all;
// urgency, mine=true, search, page, limit. Open items: urgent first, oldest first.

export async function GET(req: NextRequest) {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const q = req.nextUrl.searchParams
  const status = q.get("status") ?? "open"
  const page = Math.max(1, parseInt(q.get("page") ?? "1", 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(q.get("limit") ?? "50", 10) || 50))

  const where: Prisma.CallbackRequestWhereInput = {}
  if (status === "open") where.status = { in: ["OPEN", "IN_PROGRESS"] }
  else if (status === "done") where.status = { in: ["DONE", "CANCELLED"] }
  const urgency = q.get("urgency")
  if (urgency === "URGENT" || urgency === "NORMAL" || urgency === "LOW") where.urgency = urgency
  if (q.get("mine") === "true") where.assignedToId = guard.user.id
  const search = q.get("search")?.trim()
  if (search) {
    where.OR = [
      { callerName: { contains: search, mode: "insensitive" } },
      { phone: { contains: search.replace(/\s+/g, "") } },
      { reason: { contains: search, mode: "insensitive" } },
    ]
  }

  const [rows, total, openCount, urgentCount] = await Promise.all([
    prisma.callbackRequest.findMany({
      where,
      include: INCLUDE,
      orderBy: status === "open" ? [{ createdAt: "asc" }] : [{ completedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.callbackRequest.count({ where }),
    prisma.callbackRequest.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.callbackRequest.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, urgency: "URGENT" } }),
  ])
  const data = status === "open" ? [...rows].sort((a, b) => (URGENCY_RANK[a.urgency] ?? 9) - (URGENCY_RANK[b.urgency] ?? 9)) : rows
  return NextResponse.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }, counts: { open: openCount, urgent: urgentCount } })
}

const Create = z.object({
  callerName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(6).max(30),
  reason: z.string().trim().min(1).max(1000),
  urgency: z.enum(["LOW", "NORMAL", "URGENT"]).default("NORMAL"),
  isNewPatient: z.boolean().default(false),
  patientId: z.string().min(1).nullable().optional(),
  assignedToId: z.string().min(1).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
})

// ── POST /api/callbacks ── staff add a callback (e.g. a walk-in or a phone message) ──

export async function POST(req: NextRequest) {
  const guard = await requireStaff({ write: true })
  if (!guard.ok) return guard.response
  const parsed = Create.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 })
  const phone = toE164(parsed.data.phone)
  if (!phone) return NextResponse.json({ error: "Enter a valid phone number" }, { status: 400 })

  const cb = await prisma.callbackRequest.create({
    data: {
      callerName: parsed.data.callerName,
      phone,
      reason: parsed.data.reason,
      urgency: parsed.data.urgency,
      isNewPatient: parsed.data.isNewPatient,
      source: "STAFF",
      patientId: parsed.data.patientId ?? null,
      assignedToId: parsed.data.assignedToId ?? null,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    },
    include: INCLUDE,
  })
  await prisma.auditLog.create({
    data: { userId: guard.user.id, action: "CREATE", entity: "callback_request", entityId: cb.id, changes: { source: "staff", urgency: cb.urgency }, ...requestMeta(req), timestamp: new Date() },
  })
  return NextResponse.json(cb, { status: 201 })
}
