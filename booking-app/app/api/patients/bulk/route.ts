import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import prisma from '@/lib/prisma'
import type { PatientStatus } from '@/lib/generated/prisma/client'

export const dynamic = 'force-dynamic'

const ACTION_TO_STATUS: Record<string, PatientStatus> = {
  activate: 'ACTIVE',
  draft: 'DRAFT',
  archive: 'ARCHIVED',
}

// ── PATCH /api/patients/bulk ──────────────────────────────────────────────────
// Soft status updates only — never hard-deletes (HIPAA retention).

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const ids = body?.ids
    const action = body?.action

    if (!Array.isArray(ids) || ids.length === 0 || typeof action !== 'string') {
      return NextResponse.json(
        { error: 'Body must include ids: string[] and action' },
        { status: 400 },
      )
    }

    const status = ACTION_TO_STATUS[action]
    if (!status) {
      return NextResponse.json(
        { error: 'action must be activate | draft | archive' },
        { status: 400 },
      )
    }

    const uniqueIds = [...new Set(ids.filter((id: unknown) => typeof id === 'string' && id))]

    const result = await prisma.patient.updateMany({
      where: { id: { in: uniqueIds } },
      data: { status },
    })

    return NextResponse.json({ updated: result.count })
  } catch (error) {
    console.error('[PATCH /api/patients/bulk]', error)
    return NextResponse.json({ error: 'Failed to update patients' }, { status: 500 })
  }
}
