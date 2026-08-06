import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/lib/generated/prisma/client'

export const dynamic = 'force-dynamic'

// ── PATCH /api/email/automation/:id/toggle ───────────────────────────────────

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const current = await prisma.emailAutomationRule.findUnique({
      where:  { id },
      select: { isActive: true },
    })
    if (!current) return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 })

    const rule = await prisma.emailAutomationRule.update({
      where: { id },
      data:  { isActive: !current.isActive },
    })

    prisma.auditLog.create({
      data: {
        userId: session.user.id, action: 'UPDATE',
        entity: 'email_automation_rule', entityId: id,
        changes: { isActive: rule.isActive, previous: current.isActive },
      },
    }).catch(() => {})

    return NextResponse.json({ id, isActive: rule.isActive })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 })
    }
    console.error('[PATCH /api/email/automation/[id]/toggle]', error)
    return NextResponse.json({ error: 'Failed to toggle automation rule' }, { status: 500 })
  }
}
