import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@/lib/generated/prisma/client"
import prisma from "@/lib/prisma"
import { requestMeta, requireStaff } from "@/lib/auth/guards"

type RouteContext = { params: Promise<{ id: string }> }

const Patch = z
  .object({
    category: z.string().trim().min(1).max(60),
    question: z.string().trim().min(3).max(500),
    answer: z.string().trim().min(1).max(2000),
    priority: z.number().int().min(0).max(10),
    isActive: z.boolean(),
  })
  .partial()
  .strict()

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const { id } = await params
  const parsed = Patch.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 })
  try {
    const before = await prisma.knowledgeItem.findUnique({ where: { id } })
    const item = await prisma.knowledgeItem.update({ where: { id }, data: parsed.data })
    await prisma.auditLog.create({
      data: {
        userId: guard.user.id, action: "UPDATE", entity: "knowledge_item", entityId: id,
        changes: JSON.parse(JSON.stringify({ before: before && Object.fromEntries(Object.keys(parsed.data).map((k) => [k, (before as Record<string, unknown>)[k]])), after: parsed.data })),
        ...requestMeta(req), timestamp: new Date(),
      },
    })
    return NextResponse.json(item)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 })
    throw error
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const { id } = await params
  try {
    const item = await prisma.knowledgeItem.delete({ where: { id } })
    await prisma.auditLog.create({
      data: { userId: guard.user.id, action: "DELETE", entity: "knowledge_item", entityId: id, changes: { question: item.question }, ...requestMeta(req), timestamp: new Date() },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 })
    throw error
  }
}
