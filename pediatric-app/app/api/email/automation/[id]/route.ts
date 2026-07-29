import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/lib/generated/prisma/client'

export const dynamic = 'force-dynamic'

const UPDATABLE_FIELDS = ['name', 'triggerEvent', 'triggerOffsetHours', 'conditions', 'templateId'] as const

// ── PUT /api/email/automation/:id ────────────────────────────────────────────

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body   = await req.json()

    const data: Prisma.EmailAutomationRuleUpdateInput = {}
    for (const field of UPDATABLE_FIELDS) {
      if (field in body) (data as Record<string, unknown>)[field] = body[field]
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
    }

    const rule = await prisma.emailAutomationRule.update({
      where: { id }, data,
      include: { template: { select: { id: true, name: true } } },
    })

    prisma.auditLog.create({
      data: {
        userId: session.user.id, action: 'UPDATE',
        entity: 'email_automation_rule', entityId: id,
        changes: Object.keys(data),
      },
    }).catch(() => {})

    return NextResponse.json(rule)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 })
    }
    console.error('[PUT /api/email/automation/[id]]', error)
    return NextResponse.json({ error: 'Failed to update automation rule' }, { status: 500 })
  }
}

// ── DELETE /api/email/automation/:id ─────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    await prisma.emailAutomationRule.delete({ where: { id } })

    prisma.auditLog.create({
      data: {
        userId: session.user.id, action: 'DELETE',
        entity: 'email_automation_rule', entityId: id,
      },
    }).catch(() => {})

    return NextResponse.json({ message: 'Automation rule deleted', id })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 })
    }
    console.error('[DELETE /api/email/automation/[id]]', error)
    return NextResponse.json({ error: 'Failed to delete automation rule' }, { status: 500 })
  }
}
