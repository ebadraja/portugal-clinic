import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/lib/generated/prisma/client'

export const dynamic = 'force-dynamic'

const UPDATABLE_FIELDS = ['name', 'type', 'subject', 'htmlBody', 'plainBody', 'variables', 'isActive'] as const

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/\s+on\w+="[^"]*"/gi, '')
    .replace(/\s+on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
}

// ── GET /api/email/templates/:id ─────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const template = await prisma.emailTemplate.findUnique({
      where: { id },
      include: { _count: { select: { logs: true, campaigns: true } } },
    })

    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    return NextResponse.json(template)
  } catch (error) {
    console.error('[GET /api/email/templates/[id]]', error)
    return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 })
  }
}

// ── PUT /api/email/templates/:id ─────────────────────────────────────────────

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body   = await req.json()

    const data: Prisma.EmailTemplateUpdateInput = {}
    for (const field of UPDATABLE_FIELDS) {
      if (!(field in body)) continue
      if (field === 'htmlBody') {
        data.htmlBody = sanitizeHtml(body.htmlBody)
      } else {
        (data as Record<string, unknown>)[field] = body[field]
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
    }

    const template = await prisma.emailTemplate.update({ where: { id }, data })

    prisma.auditLog.create({
      data: {
        userId: session.user.id, action: 'UPDATE',
        entity: 'email_template', entityId: id,
        changes: Object.keys(data),
      },
    }).catch(() => {})

    return NextResponse.json(template)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    console.error('[PUT /api/email/templates/[id]]', error)
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
  }
}

// ── DELETE /api/email/templates/:id — soft delete ────────────────────────────

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    // Block delete if template is used by active automation rules or running campaigns
    const inUse = await prisma.emailAutomationRule.count({
      where: { templateId: id, isActive: true },
    })
    if (inUse > 0) {
      return NextResponse.json(
        { error: 'Cannot deactivate — template is used by active automation rules' },
        { status: 409 }
      )
    }

    const template = await prisma.emailTemplate.update({
      where: { id },
      data:  { isActive: false },
    })

    prisma.auditLog.create({
      data: {
        userId: session.user.id, action: 'DELETE',
        entity: 'email_template', entityId: id,
        changes: { softDelete: true },
      },
    }).catch(() => {})

    return NextResponse.json({ message: 'Template deactivated', id: template.id })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    console.error('[DELETE /api/email/templates/[id]]', error)
    return NextResponse.json({ error: 'Failed to deactivate template' }, { status: 500 })
  }
}
