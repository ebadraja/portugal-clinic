import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { queueCampaignBatch } from '@/services/emailQueue'
import type { Prisma } from '@/lib/generated/prisma/client'

export const dynamic = 'force-dynamic'

// ── POST /api/email/campaigns/:id/send-now ───────────────────────────────────

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const campaign = await prisma.emailCampaign.findUnique({
      where:   { id },
      include: { template: { select: { id: true, isActive: true } } },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    if (!['DRAFT', 'SCHEDULED', 'PAUSED'].includes(campaign.status)) {
      return NextResponse.json({ error: `Cannot send campaign in status: ${campaign.status}` }, { status: 409 })
    }
    if (!campaign.template.isActive) {
      return NextResponse.json({ error: 'Campaign template is inactive' }, { status: 400 })
    }

    const recipients = await buildRecipients(campaign)
    if (recipients.length === 0) {
      const sf = (campaign.segmentFilters ?? {}) as Record<string, unknown>
      const isSpecific = Array.isArray(sf.specificPatientIds) && (sf.specificPatientIds as string[]).length > 0
      return NextResponse.json({
        error: isSpecific
          ? 'None of the selected patients have an email address on file. Add an email (or parent email) to those patients, or pick different recipients.'
          : 'No eligible recipients match the segment filters. Try widening the audience.',
      }, { status: 400 })
    }

    await queueCampaignBatch(id, recipients, campaign.templateId)

    prisma.auditLog.create({
      data: {
        userId: session.user.id, action: 'UPDATE',
        entity: 'email_campaign', entityId: id,
        changes: { status: 'SENDING', recipientCount: recipients.length },
      },
    }).catch(() => {})

    return NextResponse.json({ message: 'Campaign queued', recipientCount: recipients.length })
  } catch (error) {
    console.error('[POST /api/email/campaigns/[id]/send-now]', error)
    return NextResponse.json({ error: 'Failed to send campaign' }, { status: 500 })
  }
}

async function buildRecipients(campaign: { segmentFilters: unknown }) {
  const filters = (campaign.segmentFilters ?? {}) as Record<string, unknown>

  // Hand-picked patient list takes priority over segment filters
  if (Array.isArray(filters.specificPatientIds) && (filters.specificPatientIds as string[]).length > 0) {
    const patients = await prisma.patient.findMany({
      where: {
        id:          { in: filters.specificPatientIds as string[] },
        status:      'ACTIVE',
        unsubscribe: null,
      },
      select: {
        id: true, firstName: true, lastName: true,
        parentName: true, email: true, parentEmail: true,
      },
    })
    return patients
      .filter(p => p.parentEmail || p.email)
      .map(p => ({
        patientId: p.id,
        toEmail:   encrypt(p.parentEmail || p.email!),
        variables: {
          patient_name:       `${p.firstName} ${p.lastName}`,
          patient_first_name: p.firstName,
          parent_name:        p.parentName ?? p.firstName,
          practice_name:      'Kids 0-18 Integrated Pediatrics',
        },
      }))
  }

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
      parentName: true, email: true, parentEmail: true,
    },
  })

  return patients
    .filter(p => p.parentEmail ?? p.email)
    .map(p => ({
      patientId: p.id,
      toEmail:   encrypt(p.parentEmail ?? p.email!),
      variables: {
        patient_name:       `${p.firstName} ${p.lastName}`,
        patient_first_name: p.firstName,
        parent_name:        p.parentName ?? p.firstName,
        practice_name:      'Kids 0-18 Integrated Pediatrics',
      },
    }))
}
