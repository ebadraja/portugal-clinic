import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireStaffSession } from '@/lib/messaging/session'
import { processFileUpload } from '@/lib/messaging/fileUploadServer'
import { notifyPatientOfNewMessage } from '@/lib/messaging/notifications-sms'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: conversationId } = await params
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await processFileUpload({
      buffer,
      declaredMimeType: file.type || 'application/octet-stream',
      originalFilename: file.name,
      conversationId,
      senderType: 'STAFF',
      senderId: staff.id,
      channel: 'SYSTEM',
      uploadedBy: 'staff',
      uploaderId: staff.id,
      auditUserId: staff.id,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { patientId: true },
    })

    if (conversation) {
      void notifyPatientOfNewMessage({
        patientId: conversation.patientId,
        conversationId,
        staffName: [staff.firstName, staff.lastName].filter(Boolean).join(' ') || undefined,
      }).catch((err) => {
        console.error('[files] notifyPatientOfNewMessage failed:', (err as Error).message)
      })
    }

    return NextResponse.json(
      { ...result.message, downloadUrl: result.downloadUrl },
      { status: 201 },
    )
  } catch (error) {
    console.error('[POST /api/messaging/conversations/[id]/files]', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}
