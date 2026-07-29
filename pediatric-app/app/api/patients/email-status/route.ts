import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// ── GET /api/patients/email-status?ids=id1,id2,... ───────────────────────────
// Returns the most recent email log status for each patient ID.
// Used by the patient list page for the per-row email indicator.

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rawIds = req.nextUrl.searchParams.get('ids') ?? ''
    const ids = rawIds.split(',').map(s => s.trim()).filter(Boolean).slice(0, 50)

    if (ids.length === 0) return NextResponse.json({})

    // Fetch the most recent email log for each patient in one query
    const logs = await prisma.emailLog.findMany({
      where:   { patientId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      select: {
        patientId: true,
        status:    true,
        createdAt: true,
        sentAt:    true,
        template:  { select: { name: true } },
      },
    })

    // Keep only the latest log per patient
    const byPatient: Record<string, { status: string; templateName: string; sentAt: string | null; createdAt: string }> = {}
    for (const log of logs) {
      if (!byPatient[log.patientId]) {
        byPatient[log.patientId] = {
          status:       log.status,
          templateName: log.template.name,
          sentAt:       log.sentAt?.toISOString() ?? null,
          createdAt:    log.createdAt.toISOString(),
        }
      }
    }

    return NextResponse.json(byPatient)
  } catch (error) {
    console.error('[GET /api/patients/email-status]', error)
    return NextResponse.json({ error: 'Failed to fetch email statuses' }, { status: 500 })
  }
}
