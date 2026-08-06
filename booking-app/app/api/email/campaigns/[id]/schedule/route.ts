import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// ── POST /api/email/campaigns/:id/schedule ───────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id }          = await params
    const { scheduledAt } = await req.json()

    if (!scheduledAt) return NextResponse.json({ error: 'scheduledAt is required' }, { status: 400 })
    const sendDate = new Date(scheduledAt)
    if (isNaN(sendDate.getTime())) return NextResponse.json({ error: 'Invalid scheduledAt' }, { status: 400 })
    if (sendDate <= new Date()) return NextResponse.json({ error: 'scheduledAt must be in the future' }, { status: 400 })

    const campaign = await prisma.emailCampaign.findUnique({
      where:  { id },
      select: { status: true },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    if (!['DRAFT', 'PAUSED'].includes(campaign.status)) {
      return NextResponse.json({ error: `Cannot schedule campaign in status: ${campaign.status}` }, { status: 409 })
    }

    const updated = await prisma.emailCampaign.update({
      where: { id },
      data:  { status: 'SCHEDULED', scheduledAt: sendDate },
    })

    prisma.auditLog.create({
      data: {
        userId: session.user.id, action: 'UPDATE',
        entity: 'email_campaign', entityId: id,
        changes: { status: 'SCHEDULED', scheduledAt: sendDate.toISOString() },
      },
    }).catch(() => {})

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[POST /api/email/campaigns/[id]/schedule]', error)
    return NextResponse.json({ error: 'Failed to schedule campaign' }, { status: 500 })
  }
}
