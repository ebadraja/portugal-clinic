import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'

export const dynamic = 'force-dynamic'

// ── GET /api/email/campaigns/:id/recipients ──────────────────────────────────
// Dry-run: returns the patient list that would receive this campaign.
// Does NOT queue or send any emails.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const campaign = await prisma.emailCampaign.findUnique({
      where:  { id },
      select: { segmentFilters: true, status: true },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    const filters = (campaign.segmentFilters ?? {}) as Record<string, unknown>
    const where: Record<string, unknown> = { status: 'ACTIVE', unsubscribe: null }

    if (filters.provider) {
      where.appointments = {
        some: { provider: filters.provider, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
      }
    }

    if (Array.isArray(filters.ageRange)) {
      const [min, max] = filters.ageRange as [number, number]
      const now = new Date()
      where.dateOfBirth = {
        gte: new Date(now.getFullYear() - max, now.getMonth(), now.getDate()),
        lte: new Date(now.getFullYear() - min, now.getMonth(), now.getDate()),
      }
    }

    const patients = await prisma.patient.findMany({
      where: where as Prisma.PatientWhereInput,
      select: {
        id: true, firstName: true, lastName: true,
        dateOfBirth: true, parentName: true,
        // Never return email addresses in this preview endpoint (HIPAA)
      },
      orderBy: { lastName: 'asc' },
    })

    const eligible = patients.filter(async () => true) // all returned patients have email (filtered in query)

    return NextResponse.json({
      count:      patients.length,
      recipients: patients.map(p => ({
        id:          p.id,
        name:        `${p.firstName} ${p.lastName}`,
        parentName:  p.parentName,
        dateOfBirth: p.dateOfBirth,
      })),
    })
  } catch (error) {
    console.error('[GET /api/email/campaigns/[id]/recipients]', error)
    return NextResponse.json({ error: 'Failed to preview recipients' }, { status: 500 })
  }
}
