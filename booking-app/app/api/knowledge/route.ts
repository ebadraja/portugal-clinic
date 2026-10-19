import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { requestMeta, requireStaff } from "@/lib/auth/guards"
import { CLINIC_FAQ } from "@/lib/knowledge/defaults"

export const dynamic = "force-dynamic"

// ── GET /api/knowledge ── the approved answers the voice agent may give ───────

export async function GET() {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const items = await prisma.knowledgeItem.findMany({ orderBy: [{ category: "asc" }, { priority: "desc" }, { createdAt: "asc" }] })
  return NextResponse.json({ data: items, defaultsAvailable: CLINIC_FAQ.length })
}

const Item = z.object({
  category: z.string().trim().min(1).max(60),
  question: z.string().trim().min(3).max(500),
  answer: z.string().trim().min(1).max(2000),
  priority: z.number().int().min(0).max(10).default(0),
  isActive: z.boolean().default(true),
})

const Body = z.union([z.object({ action: z.literal("import_defaults") }), Item])

// ── POST /api/knowledge ── admin: add an item, or import the clinic's FAQ ─────

export async function POST(req: NextRequest) {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 })

  if ("action" in parsed.data) {
    const existing = await prisma.knowledgeItem.findMany({ select: { question: true } })
    const have = new Set(existing.map((e) => e.question.trim().toLowerCase()))
    const missing = CLINIC_FAQ.filter((f) => !have.has(f.question.trim().toLowerCase()))
    if (missing.length > 0) {
      await prisma.knowledgeItem.createMany({ data: missing.map((f) => ({ ...f, isActive: true, sourceUrl: "dental-website FAQ" })) })
    }
    await prisma.auditLog.create({
      data: { userId: guard.user.id, action: "CREATE", entity: "knowledge_item", changes: { imported: missing.length }, ...requestMeta(req), timestamp: new Date() },
    })
    return NextResponse.json({ imported: missing.length, skipped: CLINIC_FAQ.length - missing.length }, { status: 201 })
  }

  const item = await prisma.knowledgeItem.create({ data: parsed.data })
  await prisma.auditLog.create({
    data: { userId: guard.user.id, action: "CREATE", entity: "knowledge_item", entityId: item.id, ...requestMeta(req), timestamp: new Date() },
  })
  return NextResponse.json(item, { status: 201 })
}
