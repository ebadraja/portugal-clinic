import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/lib/generated/prisma/client'

export const dynamic = 'force-dynamic'

const UPDATABLE_FIELDS = ['name', 'templateId', 'segmentFilters', 'scheduledAt'] as const

// ── GET /api/email/campaigns/:id — detail with delivery stats ────────────────

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id },
      include: {
        template:  { select: { id: true, name: true, type: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    // Aggregate delivery stats from email_logs
    const [sent, delivered, opened, clicked, bounced, failed] = await Promise.all([
      prisma.emailLog.count({ where: { campaignId: id, status: 'SENT'        } }),
      prisma.emailLog.count({ where: { campaignId: id, status: 'DELIVERED'   } }),
      prisma.emailLog.count({ where: { campaignId: id, status: 'OPENED'      } }),
      prisma.emailLog.count({ where: { campaignId: id, status: 'CLICKED'     } }),
      prisma.emailLog.count({ where: { campaignId: id, status: 'BOUNCED'     } }),
      prisma.emailLog.count({ where: { campaignId: id, status: 'FAILED'      } }),
    ])

    const total     = campaign.recipientCount || (sent + bounced + failed) || 1
    const openRate  = delivered > 0 ? Math.round((opened  / delivered) * 100) : 0
    const clickRate = opened    > 0 ? Math.round((clicked / opened)    * 100) : 0

    return NextResponse.json({
      ...campaign,
      stats: { sent, delivered, opened, clicked, bounced, failed, openRate, clickRate },
    })
  } catch (error) {
    console.error('[GET /api/email/campaigns/[id]]', error)
    return NextResponse.json({ error: 'Failed to fetch campaign' }, { status: 500 })
  }
}

// ── PUT /api/email/campaigns/:id — update (draft only) ───────────────────────

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body   = await req.json()

    const current = await prisma.emailCampaign.findUnique({
      where:  { id },
      select: { status: true },
    })
    if (!current) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    if (current.status !== 'DRAFT') {
      return NextResponse.json(
        { error: `Campaign cannot be edited in status: ${current.status}` },
        { status: 409 }
      )
    }

    const data: Prisma.EmailCampaignUpdateInput = {}
    for (const field of UPDATABLE_FIELDS) {
      if (!(field in body)) continue
      if (field === 'scheduledAt') {
        const d = new Date(body.scheduledAt)
        if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid scheduledAt' }, { status: 400 })
        data.scheduledAt = d
      } else {
        (data as Record<string, unknown>)[field] = body[field]
      }
    }

    const campaign = await prisma.emailCampaign.update({ where: { id }, data })

    prisma.auditLog.create({
      data: {
        userId: session.user.id, action: 'UPDATE',
        entity: 'email_campaign', entityId: id,
        changes: Object.keys(data),
      },
    }).catch(() => {})

    return NextResponse.json(campaign)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }
    console.error('[PUT /api/email/campaigns/[id]]', error)
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
  }
}

// ── DELETE /api/email/campaigns/:id — permanently remove a campaign ───────────

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const campaign = await prisma.emailCampaign.findUnique({
      where:  { id },
      select: { status: true, name: true },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    // Block deletion while actively sending to avoid orphaned queue jobs
    if (campaign.status === 'SENDING') {
      return NextResponse.json(
        { error: 'Cannot delete a campaign while it is sending. Pause or cancel it first.' },
        { status: 409 }
      )
    }

    // Remove delivery logs first (no FK cascade), then the campaign
    await prisma.$transaction([
      prisma.emailLog.deleteMany({ where: { campaignId: id } }),
      prisma.emailCampaign.delete({ where: { id } }),
    ])

    prisma.auditLog.create({
      data: {
        userId: session.user.id, action: 'DELETE',
        entity: 'email_campaign', entityId: id,
        changes: { name: campaign.name, status: campaign.status },
      },
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }
    console.error('[DELETE /api/email/campaigns/[id]]', error)
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 })
  }
}
