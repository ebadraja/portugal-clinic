import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'

export const dynamic = 'force-dynamic'

// ── GET /api/email/campaigns ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = req.nextUrl
    const page     = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10))
    const limit    = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
    const status   = searchParams.get('status')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo   = searchParams.get('dateTo')

    const where: Prisma.EmailCampaignWhereInput = {}
    if (status) where.status = status as Prisma.EnumEmailCampaignStatusFilter['equals']
    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo   && { lte: new Date(dateTo)   }),
      }
    }

    const [campaigns, total] = await Promise.all([
      prisma.emailCampaign.findMany({
        where,
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        include: {
          template:  { select: { id: true, name: true, type: true } },
          createdBy: { select: { firstName: true, lastName: true } },
          _count:    { select: { logs: true } },
        },
      }),
      prisma.emailCampaign.count({ where }),
    ])

    return NextResponse.json({
      data: campaigns,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('[GET /api/email/campaigns]', error)
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
  }
}

// ── POST /api/email/campaigns ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { name, templateId, segmentFilters } = body

    const missing = ['name', 'templateId'].filter(f => !body[f]?.trim?.())
    if (missing.length) {
      return NextResponse.json({ error: `Missing required fields: ${missing.join(', ')}` }, { status: 400 })
    }

    // Verify template exists and is active
    const template = await prisma.emailTemplate.findUnique({
      where:  { id: templateId },
      select: { id: true, isActive: true },
    })
    if (!template)          return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    if (!template.isActive) return NextResponse.json({ error: 'Template is inactive' }, { status: 400 })

    const campaign = await prisma.emailCampaign.create({
      data: {
        name:           name.trim(),
        templateId,
        status:         'DRAFT',
        segmentFilters: segmentFilters ?? null,
        recipientCount: 0,
        createdById:    session.user.id,
      },
      include: { template: { select: { id: true, name: true } } },
    })

    prisma.auditLog.create({
      data: {
        userId: session.user.id, action: 'CREATE',
        entity: 'email_campaign', entityId: campaign.id,
        changes: { name, templateId, status: 'DRAFT' },
      },
    }).catch(() => {})

    return NextResponse.json(campaign, { status: 201 })
  } catch (error) {
    console.error('[POST /api/email/campaigns]', error)
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }
}
