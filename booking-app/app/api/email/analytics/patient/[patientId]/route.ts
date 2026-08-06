import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// ── GET /api/email/analytics/patient/:patientId ───────────────────────────────
// Full email history for a patient — HIPAA: no email addresses in response

export async function GET(req: NextRequest, { params }: { params: Promise<{ patientId: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { patientId } = await params
    const { searchParams } = req.nextUrl
    const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))

    const patient = await prisma.patient.findUnique({
      where:  { id: patientId },
      select: { id: true, firstName: true, lastName: true },
    })
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

    const [logs, total] = await Promise.all([
      prisma.emailLog.findMany({
        where:   { patientId },
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, type: true, subject: true, status: true,
          sentAt: true, openedAt: true, clickedAt: true,
          errorMessage: true, createdAt: true,
          // HIPAA: exclude toEmail from response
          campaign:  { select: { id: true, name: true } },
          template:  { select: { id: true, name: true, type: true } },
        },
      }),
      prisma.emailLog.count({ where: { patientId } }),
    ])

    // Summary stats
    const statusCounts = await prisma.emailLog.groupBy({
      by:     ['status'],
      where:  { patientId },
      _count: { id: true },
    })
    const byStatus = Object.fromEntries(
      statusCounts.map(r => [r.status.toLowerCase(), r._count.id])
    )

    const isUnsubscribed = !!(await prisma.unsubscribe.findUnique({ where: { patientId } }))

    // Audit the access
    prisma.auditLog.create({
      data: {
        userId:   session.user.id, action: 'READ',
        entity:   'email_log',     entityId: patientId,
        changes:  { context: 'patient_email_history' },
        ipAddress: req.headers.get('x-forwarded-for') ?? null,
      },
    }).catch(() => {})

    return NextResponse.json({
      patient:      { id: patient.id, name: `${patient.firstName} ${patient.lastName}` },
      isUnsubscribed,
      summary:      byStatus,
      data:         logs,
      pagination:   { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('[GET /api/email/analytics/patient/[patientId]]', error)
    return NextResponse.json({ error: 'Failed to fetch patient email history' }, { status: 500 })
  }
}
