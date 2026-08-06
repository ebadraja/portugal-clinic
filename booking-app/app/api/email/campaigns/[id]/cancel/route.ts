import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { cancelCampaign } from '@/services/emailQueue'

export const dynamic = 'force-dynamic'

// ── POST /api/email/campaigns/:id/cancel ─────────────────────────────────────

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
    if (['SENT', 'CANCELLED'].includes(campaign.status)) {
      return NextResponse.json({ error: `Cannot cancel campaign in status: ${campaign.status}` }, { status: 409 })
    }

    await cancelCampaign(id)

    prisma.auditLog.create({
      data: {
        userId: session.user.id, action: 'UPDATE',
        entity: 'email_campaign', entityId: id,
        changes: { status: 'CANCELLED', previousStatus: campaign.status },
      },
    }).catch(() => {})

    return NextResponse.json({ message: 'Campaign cancelled', id })
  } catch (error) {
    console.error('[POST /api/email/campaigns/[id]/cancel]', error)
    return NextResponse.json({ error: 'Failed to cancel campaign' }, { status: 500 })
  }
}
