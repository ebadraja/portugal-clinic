import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import {
  getOrCreatePatientConversation,
  getPortalSessionFromCookies,
} from '@/lib/messaging/portalAuth'
import { processFileUpload } from '@/lib/messaging/fileUploadServer'
import { notifyStaffNewMessage } from '@/lib/messaging/notifications'
import { attachmentPreviewText } from '@/lib/messaging/fileAttachments'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getPortalSessionFromCookies()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    const reason = formData.get('reason')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    let conversation = await prisma.conversation.findUnique({
      where: { patientId: session.patientId },
    })

    if (!conversation) {
      if (typeof reason !== 'string' || !reason.trim()) {
        return NextResponse.json(
          { error: 'Please select a reason before uploading a file' },
          { status: 400 },
        )
      }
      conversation = await getOrCreatePatientConversation(session.patientId, reason)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await processFileUpload({
      buffer,
      declaredMimeType: file.type || 'application/octet-stream',
      originalFilename: file.name,
      conversationId: conversation.id,
      senderType: 'PATIENT',
      senderId: null,
      channel: 'PORTAL',
      uploadedBy: 'patient',
      uploaderId: session.patientId,
      auditUserId: null,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    void notifyStaffNewMessage({
      conversationId: conversation.id,
      patientFirstName: session.patient.firstName,
      patientLastName: session.patient.lastName,
      preview: attachmentPreviewText(file.name, file.type),
      assignedToId: conversation.assignedToId,
    }).catch((err) => console.error('[portal/files] notification failed:', err))

    return NextResponse.json(
      {
        ...result.message,
        downloadUrl: result.downloadUrl,
        conversationId: conversation.id,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('[POST /api/portal/files]', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}
