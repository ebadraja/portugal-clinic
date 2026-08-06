import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'

export const dynamic = 'force-dynamic'

// ── GET /api/email/templates ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = req.nextUrl
    const page   = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10))
    const limit  = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
    const type   = searchParams.get('type')
    const search = searchParams.get('search')

    const where: Prisma.EmailTemplateWhereInput = {}
    if (type)   where.type     = type as Prisma.EnumEmailTemplateTypeFilter['equals']
    if (search) where.OR = [
      { name:    { contains: search, mode: 'insensitive' } },
      { subject: { contains: search, mode: 'insensitive' } },
    ]

    const [templates, total] = await Promise.all([
      prisma.emailTemplate.findMany({
        where,
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, type: true, subject: true,
          variables: true, isActive: true, createdAt: true, updatedAt: true,
          _count: { select: { logs: true, campaigns: true } },
        },
      }),
      prisma.emailTemplate.count({ where }),
    ])

    return NextResponse.json({
      data: templates,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('[GET /api/email/templates]', error)
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
  }
}

// ── POST /api/email/templates ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { name, type, subject, htmlBody, plainBody, variables } = body

    const missing = ['name', 'type', 'subject', 'htmlBody'].filter(f => !body[f]?.trim?.())
    if (missing.length) {
      return NextResponse.json({ error: `Missing required fields: ${missing.join(', ')}` }, { status: 400 })
    }

    const VALID_TYPES = ['TRANSACTIONAL', 'BULK', 'AUTOMATED']
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
    }

    const sanitizedHtml = sanitizeHtml(htmlBody)

    const template = await prisma.emailTemplate.create({
      data: {
        name:      name.trim(),
        type,
        subject:   subject.trim(),
        htmlBody:  sanitizedHtml,
        plainBody: plainBody?.trim() ?? null,
        variables: variables ?? null,
        isActive:  true,
      },
    })

    prisma.auditLog.create({
      data: {
        userId: session.user.id, action: 'CREATE',
        entity: 'email_template', entityId: template.id,
        changes: { name, type },
      },
    }).catch(() => {})

    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    console.error('[POST /api/email/templates]', error)
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }
}

// ── HTML sanitizer (server-side, strips script tags and event handlers) ──────

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/\s+on\w+="[^"]*"/gi, '')
    .replace(/\s+on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
}
