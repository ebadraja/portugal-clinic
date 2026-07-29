import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { pauseCampaign } from '@/services/emailQueue'

export const dynamic = 'force-dynamic'

// ── POST /api/email/campaigns/:id/pause ──────────────────────────────────────

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const campaign = await prisma.emailCampaign.findUnique({
      where:  { id },
      select: { status: true },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    if (!['SENDING', 'SCHEDULED'].includes(campaign.status)) {
      return NextResponse.json({ error: `Cannot pause campaign in status: ${campaign.status}` }, { status: 409 })
    }

    await pauseCampaign(id)

    prisma.auditLog.create({
      data: {
        userId: session.user.id, action: 'UPDATE',
        entity: 'email_campaign', entityId: id,
        changes: { status: 'PAUSED', previousStatus: campaign.status },
      },
    }).catch(() => {})

    return NextResponse.json({ message: 'Campaign paused', id })
  } catch (error) {
    console.error('[POST /api/email/campaigns/[id]/pause]', error)
    return NextResponse.json({ error: 'Failed to pause campaign' }, { status: 500 })
  }
}
