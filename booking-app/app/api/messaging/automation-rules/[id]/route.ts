import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@/lib/generated/prisma/client'
import prisma from '@/lib/prisma'
import { requireStaffSession } from '@/lib/messaging/session'
import { updateAutomationRuleBody } from '@/lib/messaging/schemas'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

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

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const rule = await prisma.messagingAutomationRule.findUnique({
      where: { id },
      select: ruleSelect,
    })

    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }

    return NextResponse.json(rule)
  } catch (error) {
    console.error('[GET /api/messaging/automation-rules/[id]]', error)
    return NextResponse.json({ error: 'Failed to fetch automation rule' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const existing = await prisma.messagingAutomationRule.findUnique({
      where: { id },
      select: { id: true, templateId: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = updateAutomationRuleBody.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const payload = parsed.data
    const isAdmin = staff.role === 'ADMIN'
    if (!isAdmin && (payload.name !== undefined || payload.triggerEvent !== undefined)) {
      return NextResponse.json({ error: 'Only administrators can modify rule configuration' }, { status: 403 })
    }

    const json = (value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined => {
      if (value === undefined) return undefined
      if (value === null) return Prisma.DbNull
      return value as Prisma.InputJsonValue
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (payload.templateBody !== undefined) {
        await tx.messageTemplate.update({
          where: { id: existing.templateId },
          data: {
            body: payload.templateBody,
            ...(payload.name ? { name: payload.name } : {}),
          },
        })
      }

      return tx.messagingAutomationRule.update({
        where: { id },
        data: {
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...(payload.triggerEvent !== undefined ? { triggerEvent: payload.triggerEvent } : {}),
          ...(payload.delayMinutes !== undefined ? { delayMinutes: payload.delayMinutes } : {}),
          ...(payload.channel !== undefined ? { channel: payload.channel } : {}),
          ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
          ...(payload.conditions !== undefined ? { conditions: json(payload.conditions) } : {}),
        },
        select: ruleSelect,
      })
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[PATCH /api/messaging/automation-rules/[id]]', error)
    return NextResponse.json({ error: 'Failed to update automation rule' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await requireStaffSession()
    if (!staff || staff.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only administrators can delete automation rules' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.messagingAutomationRule.findUnique({
      where: { id },
      select: { id: true, templateId: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.messagingAutomationRule.delete({ where: { id } })
      await tx.messageTemplate.delete({ where: { id: existing.templateId } })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/messaging/automation-rules/[id]]', error)
    return NextResponse.json({ error: 'Failed to delete automation rule' }, { status: 500 })
  }
}
