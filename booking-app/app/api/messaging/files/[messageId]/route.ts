import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { auth } from '@/auth'
import { getPortalSessionFromCookies } from '@/lib/messaging/portalAuth'
import { parseFileAttachmentMetadata } from '@/lib/messaging/fileAttachments'
import {
  fileExistsOnLocalDisk,
  getSignedDownloadUrl,
  readFile,
} from '@/lib/messaging/fileStorage'
import { authorizeFileAccess } from '@/lib/messaging/fileAccess'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ messageId: string }> }

function contentDisposition(filename: string, download: boolean): string {
  const safeName = filename.replace(/["\r\n]/g, '_')
  return download ? `attachment; filename="${safeName}"` : `inline; filename="${safeName}"`
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { messageId } = await params

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: { select: { id: true, patientId: true } },
      },
    })

    if (!message || message.isInternalNote) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const attachment = parseFileAttachmentMetadata(message.metadata)
    if (!attachment) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const staffSession = await auth()
    const portalSession = staffSession?.user?.id ? null : await getPortalSessionFromCookies()

    const access = authorizeFileAccess({
      staffUserId: staffSession?.user?.id,
      portalPatientId: portalSession?.patientId,
      conversationPatientId: message.conversation.patientId,
    })

    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 403 ? 'Forbidden' : 'Unauthorized' },
        { status: access.status },
      )
    }

    await prisma.auditLog.create({
      data: {
        userId: access.accessorType === 'staff' ? access.accessorId : null,
        action: 'READ',
        entity: 'message',
        entityId: message.id,
        changes: {
          conversationId: message.conversation.id,
          accessorType: access.accessorType,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          fileAccess: true,
          ...(access.accessorType === 'patient' ? { patientId: access.accessorId } : {}),
        },
      },
    })

    const inline = request.nextUrl.searchParams.get('inline') === '1'
    const download = request.nextUrl.searchParams.get('download') === '1'
    const storedLocally = await fileExistsOnLocalDisk(attachment.storageKey)

    if (storedLocally && (inline || download)) {
      const buffer = await readFile(attachment.storageKey)
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': attachment.mimeType,
          'Content-Length': String(buffer.length),
          'Content-Disposition': contentDisposition(attachment.originalName, download),
          'Cache-Control': 'private, max-age=3600',
        },
      })
    }

    if (storedLocally) {
      return NextResponse.json({
        url: `/api/messaging/files/${messageId}?inline=1`,
      })
    }

    const signedUrl = await getSignedDownloadUrl(attachment.storageKey)

    if (download) {
      return NextResponse.redirect(signedUrl)
    }

    return NextResponse.json({ url: signedUrl })
  } catch (error) {
    console.error('[GET /api/messaging/files/[messageId]]', error)
    return NextResponse.json({ error: 'Failed to access file' }, { status: 500 })
  }
}
