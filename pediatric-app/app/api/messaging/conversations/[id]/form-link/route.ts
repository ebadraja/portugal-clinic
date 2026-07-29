import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireStaffSession } from '@/lib/messaging/session'
import { isValidFormUrl, normalizeFormUrl } from '@/lib/messaging/practiceForms'
import { appendPracticeFormLinkMessage } from '@/lib/messaging/practiceFormsServer'
import { serializeMessage } from '@/lib/messaging/serialize'

export const dynamic = 'force-dynamic'

const formUrlField = z
  .string()
  .min(1)
  .max(500)
  .transform(normalizeFormUrl)
  .refine(isValidFormUrl, { message: 'Invalid form URL' })

const formLinkBody = z
  .object({
    formId: z.string().min(1).max(64).optional(),
    formName: z.string().min(1).max(200).optional(),
    formDescription: z.string().max(500).optional(),
    formUrl: formUrlField.optional(),
    url: formUrlField.optional(),
    title: z.string().min(1).max(200).optional(),
  })
  .refine((data) => !!(data.formUrl ?? data.url), {
    message: 'formUrl or url is required',
  })

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await requireStaffSession()
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: conversationId } = await params
    const body = await request.json()
    const parsed = formLinkBody.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, patientId: true },
    })
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const formUrl = parsed.data.formUrl ?? parsed.data.url!
    const formName =
      parsed.data.formName ?? parsed.data.title ?? 'Patient intake form'
    const formDescription = parsed.data.formDescription ?? ''

    const message = await appendPracticeFormLinkMessage({
      patientId: conversation.patientId,
      form: {
        id: parsed.data.formId ?? randomUUID(),
        name: formName,
        description: formDescription,
        url: formUrl,
        isActive: true,
      },
      sentById: staff.id,
      sentByName: `${staff.firstName} ${staff.lastName}`.trim(),
    })

    const full = await prisma.message.findUnique({
      where: { id: message.id },
      include: { sender: { select: { id: true, firstName: true, lastName: true } } },
    })

    await prisma.auditLog.create({
      data: {
        userId: staff.id,
        action: 'MESSAGE_SENT',
        entity: 'message',
        entityId: message.id,
        changes: {
          conversationId,
          contentType: 'FORM_LINK',
          formUrl,
          formName,
          ...(parsed.data.formId ? { formId: parsed.data.formId } : {}),
        },
      },
    })

    return NextResponse.json(serializeMessage(full!), { status: 201 })
  } catch (error) {
    console.error('[POST /api/messaging/conversations/[id]/form-link]', error)
    return NextResponse.json({ error: 'Failed to send form link' }, { status: 500 })
  }
}
