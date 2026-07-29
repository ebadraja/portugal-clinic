import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/lib/generated/prisma/client'

export const dynamic = 'force-dynamic'

// ── POST /api/patients/:id/unsubscribe — admin-initiated unsubscribe ──────────

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const patient = await prisma.patient.findUnique({
      where:  { id },
      select: { id: true, parentEmail: true, email: true, firstName: true, lastName: true },
    })
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

    await prisma.unsubscribe.upsert({
      where:  { patientId: id },
      create: { patientId: id, email: patient.parentEmail ?? patient.email ?? '', reason: 'admin_initiated' },
      update: { reason: 'admin_initiated' },
    })

    prisma.auditLog.create({
      data: {
        userId:  session.user.id, action: 'CREATE',
        entity:  'unsubscribe',   entityId: id,
        changes: { reason: 'admin_initiated', patient: `${patient.firstName} ${patient.lastName}` },
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, patientId: id, isUnsubscribed: true })
  } catch (error) {
    console.error('[POST /api/patients/[id]/unsubscribe]', error)
    return NextResponse.json({ error: 'Failed to unsubscribe patient' }, { status: 500 })
  }
}

// ── DELETE /api/patients/:id/unsubscribe — re-subscribe ──────────────────────

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    await prisma.unsubscribe.delete({ where: { patientId: id } })

    prisma.auditLog.create({
      data: {
        userId:  session.user.id, action: 'DELETE',
        entity:  'unsubscribe',   entityId: id,
        changes: { reason: 're-subscribed by admin' },
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, patientId: id, isUnsubscribed: false })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ success: true, patientId: (await params).id, isUnsubscribed: false })
    }
    console.error('[DELETE /api/patients/[id]/unsubscribe]', error)
    return NextResponse.json({ error: 'Failed to re-subscribe patient' }, { status: 500 })
  }
}
