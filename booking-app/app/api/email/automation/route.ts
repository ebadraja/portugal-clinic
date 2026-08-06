import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'

export const dynamic = 'force-dynamic'

const VALID_TRIGGER_EVENTS = [
  'APPOINTMENT_CREATED', 'APPOINTMENT_UPDATED', 'APPOINTMENT_CANCELLED',
  'X_DAYS_BEFORE', 'X_DAYS_AFTER', 'PATIENT_CREATED',
]

// ── GET /api/email/automation ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = req.nextUrl
    const isActive = searchParams.get('isActive')

    const where: Prisma.EmailAutomationRuleWhereInput = {}
    if (isActive !== null) where.isActive = isActive === 'true'

    const rules = await prisma.emailAutomationRule.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { template: { select: { id: true, name: true, type: true } } },
    })

    return NextResponse.json({ data: rules })
  } catch (error) {
    console.error('[GET /api/email/automation]', error)
    return NextResponse.json({ error: 'Failed to fetch automation rules' }, { status: 500 })
  }
}

// ── POST /api/email/automation ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { name, triggerEvent, triggerOffsetHours, conditions, templateId } = body

    const missing = ['name', 'triggerEvent', 'templateId'].filter(f => !body[f]?.toString?.().trim())
    if (missing.length) {
      return NextResponse.json({ error: `Missing required fields: ${missing.join(', ')}` }, { status: 400 })
    }

    if (!VALID_TRIGGER_EVENTS.includes(triggerEvent)) {
      return NextResponse.json({ error: `Invalid triggerEvent. Must be one of: ${VALID_TRIGGER_EVENTS.join(', ')}` }, { status: 400 })
    }

    // offset required for time-based triggers
    if (['X_DAYS_BEFORE', 'X_DAYS_AFTER'].includes(triggerEvent) && triggerOffsetHours == null) {
      return NextResponse.json({ error: 'triggerOffsetHours is required for X_DAYS_BEFORE/AFTER triggers' }, { status: 400 })
    }

    const template = await prisma.emailTemplate.findUnique({
      where: { id: templateId }, select: { isActive: true },
    })
    if (!template)          return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    if (!template.isActive) return NextResponse.json({ error: 'Template is inactive' }, { status: 400 })

    const rule = await prisma.emailAutomationRule.create({
      data: {
        name: name.trim(),
        triggerEvent,
        triggerOffsetHours: triggerOffsetHours ?? null,
        conditions:         conditions ?? null,
        templateId,
        isActive:           true,
      },
      include: { template: { select: { id: true, name: true } } },
    })

    prisma.auditLog.create({
      data: {
        userId: session.user.id, action: 'CREATE',
        entity: 'email_automation_rule', entityId: rule.id,
        changes: { name, triggerEvent, templateId },
      },
    }).catch(() => {})

    return NextResponse.json(rule, { status: 201 })
  } catch (error) {
    console.error('[POST /api/email/automation]', error)
    return NextResponse.json({ error: 'Failed to create automation rule' }, { status: 500 })
  }
}
