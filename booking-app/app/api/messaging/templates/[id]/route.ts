import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireStaffSession } from '@/lib/messaging/session'
import { updateTemplateBody } from '@/lib/messaging/schemas'
import { resolveMessagingMergeTags } from '@/lib/messaging/mergeTags'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const patientId = request.nextUrl.searchParams.get('patientId')

    const template = await prisma.messageTemplate.findUnique({ where: { id } })
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    if (patientId && request.nextUrl.searchParams.get('preview') === 'true') {
      const body = await resolveMessagingMergeTags(template.body, { patientId })
      return NextResponse.json({ ...template, previewBody: body })
    }

    return NextResponse.json(template)
  } catch (error) {
    console.error('[GET /api/messaging/templates/[id]]', error)
    return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const existing = await prisma.messageTemplate.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    if (existing.isLocked && staff.role !== 'ADMIN') {
      return NextResponse.json({ error: 'This template is locked' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = updateTemplateBody.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const template = await prisma.messageTemplate.update({
      where: { id },
      data: parsed.data,
    })

    return NextResponse.json(template)
  } catch (error) {
    console.error('[PATCH /api/messaging/templates/[id]]', error)
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const existing = await prisma.messageTemplate.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    if (existing.isLocked && staff.role !== 'ADMIN') {
      return NextResponse.json({ error: 'This template is locked' }, { status: 403 })
    }

    await prisma.messageTemplate.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/messaging/templates/[id]]', error)
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }
}
