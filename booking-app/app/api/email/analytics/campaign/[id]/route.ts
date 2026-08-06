import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// ── GET /api/email/analytics/campaign/:id ────────────────────────────────────

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const campaign = await prisma.emailCampaign.findUnique({
      where:   { id },
      include: { template: { select: { id: true, name: true } } },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    // Status counts
    const statusCounts = await prisma.emailLog.groupBy({
      by:     ['status'],
      where:  { campaignId: id },
      _count: { id: true },
    })

    const byStatus = Object.fromEntries(
      statusCounts.map(r => [r.status.toLowerCase(), r._count.id])
    ) as Record<string, number>

    const delivered = (byStatus.delivered ?? 0) + (byStatus.opened ?? 0) + (byStatus.clicked ?? 0)
    const opened    = (byStatus.opened    ?? 0) + (byStatus.clicked ?? 0)

    // Timeline: sent_at distribution by hour
    const timeline = await prisma.emailLog.findMany({
      where:   { campaignId: id, sentAt: { not: null } },
      select:  { sentAt: true, status: true },
      orderBy: { sentAt: 'asc' },
    })

    // Hourly bucketing
    const hourlyMap: Record<string, { sent: number; opened: number; clicked: number }> = {}
    for (const log of timeline) {
      const hour = log.sentAt!.toISOString().slice(0, 13) + ':00'
      if (!hourlyMap[hour]) hourlyMap[hour] = { sent: 0, opened: 0, clicked: 0 }
      hourlyMap[hour].sent++
      if (log.status === 'OPENED')  hourlyMap[hour].opened++
      if (log.status === 'CLICKED') hourlyMap[hour].clicked++
    }
    const hourlyTrend = Object.entries(hourlyMap).map(([hour, counts]) => ({ hour, ...counts }))

    // Recent opens (last 20)
    const recentOpens = await prisma.emailLog.findMany({
      where:   { campaignId: id, status: { in: ['OPENED', 'CLICKED'] }, openedAt: { not: null } },
      select:  { openedAt: true, status: true },
      orderBy: { openedAt: 'desc' },
      take:    20,
    })

    return NextResponse.json({
      campaign: {
        id:             campaign.id,
        name:           campaign.name,
        status:         campaign.status,
        recipientCount: campaign.recipientCount,
        sentAt:         campaign.sentAt,
        template:       campaign.template,
      },
      stats: {
        ...byStatus,
        deliveryRate:    campaign.recipientCount > 0
          ? Math.round((delivered / campaign.recipientCount) * 100) : 0,
        openRate:        delivered > 0 ? Math.round((opened          / delivered) * 100) : 0,
        clickToOpenRate: opened    > 0 ? Math.round(((byStatus.clicked ?? 0) / opened) * 100) : 0,
        bounceRate:      campaign.recipientCount > 0
          ? Math.round(((byStatus.bounced ?? 0) / campaign.recipientCount) * 100) : 0,
      },
      hourlyTrend,
      recentOpens,
    })
  } catch (error) {
    console.error('[GET /api/email/analytics/campaign/[id]]', error)
    return NextResponse.json({ error: 'Failed to fetch campaign analytics' }, { status: 500 })
  }
}
