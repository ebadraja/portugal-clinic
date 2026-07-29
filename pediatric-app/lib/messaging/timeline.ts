import prisma from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'

export type TimelineEntryType =
  | 'message'
  | 'appointment'
  | 'call_log'
  | 'email'
  | 'intake_form'

export type TimelineEntry = {
  id: string
  type: TimelineEntryType
  title: string
  summary: string
  occurredAt: string
  metadata?: Record<string, unknown>
}

const DEFAULT_LIMIT = 60

export async function buildPatientTimeline(
  patientId: string,
  limit = DEFAULT_LIMIT,
): Promise<TimelineEntry[]> {
  const conversation = await prisma.conversation.findUnique({
    where: { patientId },
    select: { id: true },
  })

  const [messages, appointments, callLogs, emailLogs, intakeForms] = await Promise.all([
    conversation
      ? prisma.message.findMany({
          where: {
            conversationId: conversation.id,
            isInternalNote: false,
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            senderType: true,
            channel: true,
            content: true,
            contentType: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    prisma.appointment.findMany({
      where: { patientId },
      orderBy: { startTime: 'desc' },
      take: limit,
      select: {
        id: true,
        startTime: true,
        type: true,
        status: true,
        provider: true,
        bookedVia: true,
      },
    }),
    prisma.callLog.findMany({
      where: { patientId },
      orderBy: { startTime: 'desc' },
      take: limit,
      select: {
        id: true,
        startTime: true,
        duration: true,
        outcome: true,
        summary: true,
      },
    }),
    prisma.emailLog.findMany({
      where: { patientId },
      orderBy: { sentAt: 'desc' },
      take: limit,
      select: {
        id: true,
        subject: true,
        status: true,
        sentAt: true,
        campaignId: true,
      },
    }),
    prisma.intakeForm.findMany({
      where: { patientId },
      orderBy: { submittedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        hippatizFormTitle: true,
        status: true,
        submittedAt: true,
        hippatizViewLink: true,
      },
    }),
  ])

  const entries: TimelineEntry[] = []

  for (const m of messages) {
    const preview = decrypt(m.content)
    entries.push({
      id: m.id,
      type: 'message',
      title:
        m.senderType === 'STAFF'
          ? 'Staff message'
          : m.senderType === 'PATIENT'
            ? `Patient (${m.channel.replace('_', ' ')})`
            : 'System event',
      summary: preview.slice(0, 200),
      occurredAt: m.createdAt.toISOString(),
      metadata: { channel: m.channel, contentType: m.contentType, senderType: m.senderType },
    })
  }

  for (const a of appointments) {
    entries.push({
      id: a.id,
      type: 'appointment',
      title: `Appointment — ${a.type.replace(/_/g, ' ')}`,
      summary: `${a.status}${a.provider ? ` · ${a.provider}` : ''}${a.bookedVia ? ` · via ${a.bookedVia}` : ''}`,
      occurredAt: a.startTime.toISOString(),
      metadata: { status: a.status },
    })
  }

  for (const c of callLogs) {
    entries.push({
      id: c.id,
      type: 'call_log',
      title: 'Phone call',
      summary: c.summary ?? `${c.outcome}${c.duration ? ` · ${c.duration}s` : ''}`,
      occurredAt: c.startTime.toISOString(),
      metadata: { outcome: c.outcome },
    })
  }

  for (const e of emailLogs) {
    if (!e.sentAt) continue
    entries.push({
      id: e.id,
      type: 'email',
      title: 'Email sent',
      summary: e.subject ?? e.status,
      occurredAt: e.sentAt.toISOString(),
      metadata: { status: e.status },
    })
  }

  for (const f of intakeForms) {
    entries.push({
      id: f.id,
      type: 'intake_form',
      title: 'Intake form',
      summary: `${f.hippatizFormTitle} — ${f.status}`,
      occurredAt: f.submittedAt.toISOString(),
      metadata: { viewLink: f.hippatizViewLink, status: f.status },
    })
  }

  return entries
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, limit)
}

export async function computeMessagingKpis() {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  const [messagesToday, openConversations, conversationsWithMessages] = await Promise.all([
    prisma.message.count({
      where: {
        createdAt: { gte: todayStart, lte: todayEnd },
        isInternalNote: false,
        senderType: { in: ['PATIENT', 'STAFF'] },
      },
    }),
    prisma.conversation.count({
      where: { status: { in: ['OPEN', 'AWAITING_REPLY'] } },
    }),
    prisma.conversation.findMany({
      where: {
        messages: { some: { isInternalNote: false, senderType: 'PATIENT' } },
      },
      select: {
        id: true,
        messages: {
          where: { isInternalNote: false },
          orderBy: { createdAt: 'asc' },
          select: { senderType: true, createdAt: true },
        },
      },
      take: 200,
    }),
  ])

  const responseTimesMs: number[] = []

  for (const conv of conversationsWithMessages) {
    const msgs = conv.messages
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].senderType !== 'PATIENT') continue
      const patientAt = msgs[i].createdAt.getTime()
      const staffReply = msgs.slice(i + 1).find((m) => m.senderType === 'STAFF')
      if (staffReply) {
        responseTimesMs.push(staffReply.createdAt.getTime() - patientAt)
        break
      }
    }
  }

  const avgFirstResponseMinutes =
    responseTimesMs.length > 0
      ? Math.round(
          responseTimesMs.reduce((a, b) => a + b, 0) / responseTimesMs.length / 60_000,
        )
      : null

  return {
    messagesToday,
    openConversations,
    avgFirstResponseMinutes,
  }
}
