import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@/lib/generated/prisma/client'
import prisma from '@/lib/prisma'
import { requireStaffSession } from '@/lib/messaging/session'
import { createAutomationRuleBody } from '@/lib/messaging/schemas'
import { seedDefaultAutomationRules } from '@/lib/messaging/seedAutomationRules'

export const dynamic = 'force-dynamic'

const ruleSelect = {
  id: true,
  name: true,
  triggerEvent: true,
  delayMinutes: true,
  channel: true,
  conditions: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  template: {
    select: {
      id: true,
      name: true,
      body: true,
      category: true,
      channel: true,
    },
  },
} as const

export async function GET() {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await seedDefaultAutomationRules()

    const rules = await prisma.messagingAutomationRule.findMany({
      orderBy: [{ triggerEvent: 'asc' }, { delayMinutes: 'desc' }],
      select: ruleSelect,
    })

    return NextResponse.json({ data: rules })
  } catch (error) {
    console.error('[GET /api/messaging/automation-rules]', error)
    return NextResponse.json({ error: 'Failed to fetch automation rules' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const staff = await requireStaffSession()
    if (!staff || staff.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only administrators can create automation rules' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = createAutomationRuleBody.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const payload = parsed.data
    const conditions = payload.conditions ?? { suppressEmailForSameTrigger: true }

    const created = await prisma.$transaction(async (tx) => {
      const template = await tx.messageTemplate.create({
        data: {
          name: payload.name,
          category: 'Automation',
          body: payload.templateBody,
          channel: payload.channel,
          createdById: staff.id,
        },
      })

      return tx.messagingAutomationRule.create({
        data: {
          name: payload.name,
          triggerEvent: payload.triggerEvent,
          delayMinutes: payload.delayMinutes,
          channel: payload.channel,
          isActive: payload.isActive,
          conditions: conditions as Prisma.InputJsonValue,
          templateId: template.id,
        },
        select: ruleSelect,
      })
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error('[POST /api/messaging/automation-rules]', error)
    return NextResponse.json({ error: 'Failed to create automation rule' }, { status: 500 })
  }
}
