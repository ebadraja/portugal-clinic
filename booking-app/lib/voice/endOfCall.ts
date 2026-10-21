/**
 * Files a finished Vapi call (end-of-call-report) or web conversation
 * (conversation-update) into the CRM.
 *
 * Outcome precedence for phone calls:
 *   1. What the tools actually did during this call (audited with the call id):
 *      a booking or reschedule ⇒ BOOKED, a cancellation ⇒ CANCELLATION intent,
 *      a callback request ⇒ flagged for follow-up.
 *   2. Vapi structured output (lib/voice/contract.ts).
 *   3. Keyword inference over the summary — a labelled fallback that may never
 *      claim BOOKED on its own (a booking without a tool record didn't happen).
 */
import prisma from '@/lib/prisma'
import { Prisma } from '@/lib/generated/prisma/client'
import { phoneKey } from '@/lib/clinic/phone'
import { STRUCTURED_OUTPUT_NAME, parseStructuredData, toCallOutcomeEnum, type ParsedStructured } from '@/lib/voice/contract'

// ─── Payload types ────────────────────────────────────────────────────────────

export interface VapiCustomer { name?: string; number?: string; email?: string }
export interface VapiCall {
  id: string
  type?: 'webCall' | 'inboundPhoneCall' | 'outboundPhoneCall'
  customer?: VapiCustomer
  startedAt?: string
  endedAt?: string
  metadata?: Record<string, unknown>
}
export interface VapiMessage { role: 'user' | 'assistant' | 'system' | 'bot' | 'tool'; content?: string; message?: string; time?: number; secondsFromStart?: number }
export interface VapiArtifact {
  messages?: VapiMessage[]
  transcript?: string
  recordingUrl?: string
  stereoRecordingUrl?: string
  /** Vapi structured outputs, keyed by output id: { name, result } (result null = extraction failed). */
  structuredOutputs?: Record<string, { name?: string; result?: unknown } | null>
}

/**
 * The call's structured data: the CRM's structured output (by name) when present, else the first
 * object-shaped one, else the legacy analysis plan's structuredData.
 */
export function pickStructuredData(report: Pick<VapiEndOfCallReport, 'artifact' | 'analysis'>): unknown {
  const outputs = Object.values(report.artifact?.structuredOutputs ?? {}).filter((o): o is { name?: string; result?: unknown } => !!o)
  const ours = outputs.find((o) => o.name === STRUCTURED_OUTPUT_NAME && o.result && typeof o.result === 'object')
  const anyObject = outputs.find((o) => o.result && typeof o.result === 'object')
  return ours?.result ?? anyObject?.result ?? report.analysis?.structuredData
}
export interface VapiAnalysis { summary?: string; structuredData?: Record<string, unknown>; successEvaluation?: string }
export interface VapiEndOfCallReport {
  type: 'end-of-call-report'
  call: VapiCall
  transcript?: string
  summary?: string
  messages?: VapiMessage[]
  recordingUrl?: string
  endedReason?: string
  artifact?: VapiArtifact
  analysis?: VapiAnalysis
  startedAt?: string
  endedAt?: string
}

type CallIntentType = 'APPOINTMENT_BOOKING' | 'INQUIRY' | 'COMPLAINT' | 'SUPPORT' | 'ROUTING' | 'CANCELLATION' | 'VERIFICATION' | 'EMERGENCY' | 'GENERAL'
type CallOutcomeType = 'IN_PROGRESS' | 'BOOKED' | 'INFO_PROVIDED' | 'TRANSFERRED' | 'HUNG_UP' | 'VOICEMAIL'
type SentimentType = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'
type ChatOutcomeType = 'IN_PROGRESS' | 'BOOKED' | 'INFO_PROVIDED' | 'ESCALATED_TO_CALL' | 'LEAD_CAPTURED' | 'ABANDONED'

// ─── Keyword fallbacks (pt + en) ──────────────────────────────────────────────

export function inferCallIntent(text: string): CallIntentType {
  const t = text.toLowerCase()
  if (/\b(emergency|urgent|urgência|urgencia|dor forte|inchaço|inchaco|swelling|bleeding|hemorragia|trauma)\b/.test(t)) return 'EMERGENCY'
  if (/\b(cancel|cancellation|desmarcar|cancelar)\b/.test(t)) return 'CANCELLATION'
  if (/\b(appointment|schedule|book|reschedule|marcar|consulta|remarcar)\b/.test(t)) return 'APPOINTMENT_BOOKING'
  if (/\b(complaint|complain|unhappy|reclamação|reclamacao|queixa)\b/.test(t)) return 'COMPLAINT'
  if (/\b(transfer|human|staff|receção|rececao|recepcionista|falar com alguém)\b/.test(t)) return 'ROUTING'
  if (/\b(insurance|seguro|price|preço|preco|cost|custo|hours|horário|horario|location|morada|services|serviços)\b/.test(t)) return 'INQUIRY'
  return 'GENERAL'
}

export function inferCallOutcome(summary: string, transcript: string, endedReason?: string, messageCount?: number): CallOutcomeType {
  const combined = `${summary} ${transcript}`.toLowerCase()
  if (endedReason === 'voicemail') return 'VOICEMAIL'
  if (/\b(transfer|transferid|escalat|human agent)\b/.test(combined)) return 'TRANSFERRED'
  if (endedReason === 'silence-timed-out' || (messageCount !== undefined && messageCount <= 2)) return 'HUNG_UP'
  return 'INFO_PROVIDED'
}

export function inferSentiment(transcript: string): SentimentType {
  const t = transcript.toLowerCase()
  if (/\b(thank you|great|perfect|obrigad[oa]|ótimo|otimo|perfeito|excelente)\b/.test(t)) return 'POSITIVE'
  if (/\b(frustrat|upset|angry|terrible|zangad[oa]|chatead[oa]|péssimo|pessimo|vergonha)\b/.test(t)) return 'NEGATIVE'
  return 'NEUTRAL'
}

function inferTopic(text: string): 'APPOINTMENT' | 'PRICING' | 'INSURANCE' | 'HOURS' | 'SERVICES' | 'LOCATION' | 'OTHER' {
  const t = text.toLowerCase()
  if (/\b(appointment|schedule|book|reschedule|cancel|marcar|consulta|desmarcar)\b/.test(t)) return 'APPOINTMENT'
  if (/\b(insurance|seguro|advancecare|coverage)\b/.test(t)) return 'INSURANCE'
  if (/\b(price|cost|fee|preço|preco|custo|pagamento|payment)\b/.test(t)) return 'PRICING'
  if (/\b(hours|open|close|horário|horario|aberto|fechado)\b/.test(t)) return 'HOURS'
  if (/\b(location|address|morada|onde|parking|estacionamento)\b/.test(t)) return 'LOCATION'
  if (/\b(service|treatment|tratamento|implante|ortodontia|higiene|branqueamento)\b/.test(t)) return 'SERVICES'
  return 'OTHER'
}

function inferChatOutcome(summary: string, transcript: string, endedReason?: string, messageCount?: number): ChatOutcomeType {
  const combined = `${summary} ${transcript}`.toLowerCase()
  if (/\b(booked|scheduled|confirmed|marcad[ao])\b/.test(combined)) return 'BOOKED'
  if (/\b(transfer|escalat|call you back|ligar de volta)\b/.test(combined)) return 'ESCALATED_TO_CALL'
  if (/\b(contact.*info|left.*details|contacto)\b/.test(combined)) return 'LEAD_CAPTURED'
  if (endedReason === 'silence-timed-out' || endedReason === 'voicemail' || (messageCount !== undefined && messageCount <= 2)) return 'ABANDONED'
  return 'INFO_PROVIDED'
}

// ─── Tool facts recorded during the call ──────────────────────────────────────

export type ToolFacts = { booked: string[]; rescheduled: string[]; cancelled: string[]; callbacks: string[]; urgentCallback: boolean }

export async function getToolFacts(callId: string): Promise<ToolFacts> {
  const rows = await prisma.auditLog.findMany({
    where: { entity: { in: ['appointment', 'callback_request'] }, changes: { path: ['vapiCallId'], equals: callId } },
    select: { entity: true, entityId: true, action: true, changes: true },
    take: 50,
  })
  const facts: ToolFacts = { booked: [], rescheduled: [], cancelled: [], callbacks: [], urgentCallback: false }
  for (const r of rows) {
    const c = (r.changes ?? {}) as Record<string, unknown>
    if (!r.entityId) continue
    if (r.entity === 'callback_request') {
      facts.callbacks.push(r.entityId)
      if (c.urgency === 'URGENT') facts.urgentCallback = true
    } else if (r.action === 'CREATE') facts.booked.push(r.entityId)
    else if (c.action === 'rescheduled') facts.rescheduled.push(r.entityId)
    else if (c.action === 'cancelled') facts.cancelled.push(r.entityId)
  }
  return facts
}

/** Pure: the single place the call's outcome, intent and follow-up flag are decided. */
export function resolveCallResult(input: {
  facts: ToolFacts
  structured: ParsedStructured
  summary: string
  transcript: string
  endedReason?: string
  messageCount: number
}): { outcome: CallOutcomeType; intent: CallIntentType; flagForFollowUp: boolean; outcomeSource: 'tools' | 'structured' | 'inferred' } {
  const { facts, structured } = input
  const combined = `${input.summary} ${input.transcript}`

  let outcome: CallOutcomeType
  let outcomeSource: 'tools' | 'structured' | 'inferred'
  if (input.endedReason === 'voicemail') {
    outcome = 'VOICEMAIL'
    outcomeSource = 'structured'
  } else if (facts.booked.length > 0 || facts.rescheduled.length > 0) {
    outcome = 'BOOKED'
    outcomeSource = 'tools'
  } else {
    const mapped = toCallOutcomeEnum(structured.outcome)
    // The model may not claim a booking the tools didn't make.
    if (mapped && mapped !== 'BOOKED') {
      outcome = mapped
      outcomeSource = 'structured'
    } else {
      outcome = inferCallOutcome(input.summary, input.transcript, input.endedReason, input.messageCount)
      outcomeSource = 'inferred'
    }
  }

  let intent: CallIntentType
  if (structured.urgent === true || facts.urgentCallback) intent = 'EMERGENCY'
  else if (facts.cancelled.length > 0) intent = 'CANCELLATION'
  else if (facts.booked.length > 0 || facts.rescheduled.length > 0) intent = 'APPOINTMENT_BOOKING'
  else if (structured.intent) intent = structured.intent
  else intent = inferCallIntent(combined)

  const flagForFollowUp =
    facts.callbacks.length > 0 || structured.urgent === true || structured.outcome === 'CALLBACK_REQUESTED' || outcome === 'VOICEMAIL'

  return { outcome, intent, flagForFollowUp, outcomeSource }
}

// ─── Patient matching ─────────────────────────────────────────────────────────

/** Unique patient for a caller number (compared on the last 9 digits). A shared family number matches nobody. */
export async function findPatientIdByPhone(phone: string | null): Promise<string | null> {
  const key = phoneKey(phone)
  if (!key) return null
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM patients
    WHERE status::text <> 'ARCHIVED'
      AND (right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 9) = ${key}
        OR right(regexp_replace(coalesce(parent_phone, ''), '\\D', '', 'g'), 9) = ${key})
    LIMIT 2`
  return rows.length === 1 ? rows[0].id : null
}

function mapMessages(vapiMessages: VapiMessage[]) {
  return vapiMessages
    .filter((m) => m.role !== 'system' && m.role !== 'tool' && (m.content || m.message))
    .map((m) => ({
      type: (m.role === 'assistant' || m.role === 'bot' ? 'bot' : 'visitor') as 'bot' | 'visitor',
      content: (m.content ?? m.message ?? '').trim(),
      timestamp: m.time ? new Date(m.time).toISOString() : new Date().toISOString(),
    }))
    .filter((m) => m.content.length > 0)
}

// ─── Processor ────────────────────────────────────────────────────────────────

export async function processVapiEndOfCall(
  report: VapiEndOfCallReport,
  requestIp: string | null,
  isPhoneCall = true,
): Promise<{ chatLogId: string | null; callLogId: string | null; alreadyExists?: boolean }> {
  const call = report.call
  const rawMessages: VapiMessage[] = report.artifact?.messages ?? report.messages ?? []
  const transcript = report.artifact?.transcript ?? report.transcript ?? ''
  const summary = report.analysis?.summary ?? report.summary ?? ''
  const recordingUrl = report.artifact?.recordingUrl ?? report.recordingUrl ?? null
  const mapped = mapMessages(rawMessages)
  const structured = parseStructuredData(pickStructuredData(report))

  const visitorName = call.customer?.name ?? null
  const visitorPhone = call.customer?.number ?? null
  const visitorEmail = call.customer?.email ?? null

  const startedAt = call.startedAt ?? report.startedAt
  const endedAt = call.endedAt ?? report.endedAt
  const startTime = startedAt ? new Date(startedAt) : new Date()
  const endTime = endedAt ? new Date(endedAt) : null
  const duration = endTime ? Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 1000)) : null

  if (isPhoneCall) {
    const existing = await prisma.callLog.findUnique({ where: { vapiCallId: call.id }, select: { id: true } })
    if (existing) return { chatLogId: null, callLogId: existing.id, alreadyExists: true }

    const facts = await getToolFacts(call.id)
    const result = resolveCallResult({ facts, structured, summary, transcript, endedReason: report.endedReason, messageCount: mapped.length })

    // Patient: the booked appointment's patient is strongest evidence, then caller ID, then email.
    let patientId: string | null = null
    const touchedAppointmentId = facts.booked[0] ?? facts.rescheduled[0] ?? facts.cancelled[0]
    if (touchedAppointmentId) {
      const a = await prisma.appointment.findUnique({ where: { id: touchedAppointmentId }, select: { patientId: true } })
      patientId = a?.patientId ?? null
    }
    if (!patientId) patientId = await findPatientIdByPhone(visitorPhone)
    if (!patientId && visitorEmail) {
      const m = await prisma.patient.findMany({ where: { email: { equals: visitorEmail, mode: 'insensitive' } }, select: { id: true }, take: 2 })
      if (m.length === 1) patientId = m[0].id
    }

    let callLogId: string | null = null
    try {
      const callLog = await prisma.callLog.create({
        data: {
          callerName: visitorName ?? structured.callerName,
          callerPhone: visitorPhone ?? 'unknown',
          startTime,
          endTime,
          duration,
          intent: result.intent,
          outcome: result.outcome,
          sentiment: inferSentiment(transcript),
          transcript: transcript || null,
          summary: summary || null,
          recordingUrl,
          vapiCallId: call.id,
          wasEscalated: result.outcome === 'TRANSFERRED',
          escalationReason: result.outcome === 'TRANSFERRED' ? 'Transferred by the voice agent' : null,
          appointmentBooked: result.outcome === 'BOOKED',
          appointmentId: facts.booked.length === 1 ? facts.booked[0] : null,
          flagForFollowUp: result.flagForFollowUp,
          patientId,
        },
      })
      callLogId = callLog.id
    } catch (err) {
      // Two deliveries of the same report raced: the unique vapiCallId decides; the loser is a duplicate.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await prisma.callLog.findUnique({ where: { vapiCallId: call.id }, select: { id: true } })
        return { chatLogId: null, callLogId: winner?.id ?? null, alreadyExists: true }
      }
      throw err
    }

    if (patientId && facts.callbacks.length > 0) {
      await prisma.callbackRequest.updateMany({ where: { id: { in: facts.callbacks }, patientId: null }, data: { patientId } })
    }

    await prisma.auditLog.create({
      data: {
        userId: null, action: 'CREATE', entity: 'call_log', entityId: callLogId,
        changes: { source: 'vapi_webhook', vapiCallId: call.id, callType: call.type ?? 'unknown', outcomeSource: result.outcomeSource },
        ipAddress: requestIp, userAgent: 'Vapi-Webhook', timestamp: new Date(),
      },
    })

    try {
      const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true, approvalStatus: 'APPROVED' }, select: { id: true } })
      const callerLabel = visitorName ?? structured.callerName ?? (visitorPhone ? `…${visitorPhone.slice(-3)}` : 'Unknown caller')
      const durationLabel = duration ? `${Math.floor(duration / 60)}m ${duration % 60}s` : null
      let title = 'New call received'
      let icon = 'phone'
      let message = `${callerLabel}${durationLabel ? ` · ${durationLabel}` : ''} · ${result.intent.replace(/_/g, ' ').toLowerCase()}`
      if (result.outcome === 'BOOKED') { title = 'Appointment booked by phone'; icon = 'check' }
      else if (result.outcome === 'TRANSFERRED') { title = 'Call transferred to staff'; icon = 'alert' }
      else if (result.intent === 'EMERGENCY') { title = 'Urgent call'; icon = 'alert' }
      else if (result.outcome === 'VOICEMAIL') { title = 'Voicemail'; icon = 'alert' }
      else if (result.outcome === 'HUNG_UP') { title = 'Missed / short call'; icon = 'alert' }
      if (result.flagForFollowUp) message += ' · follow-up needed'
      if (admins.length) {
        await prisma.notification.createMany({
          data: admins.map((a) => ({ userId: a.id, type: 'call_received', title, message, icon, entityType: 'call_log', entityId: callLogId, actionUrl: '/call-logs' })),
        })
      }
    } catch (err) {
      console.error('[vapi] call notification failed:', (err as Error).message)
    }

    return { chatLogId: null, callLogId }
  }

  // ── Web conversation → ChatLog (website chatbot is out of scope; filing kept as before,
  //    except patients are matched only by a unique phone or email, never by a spoken name) ──
  const existing = await prisma.chatLog.findUnique({ where: { sessionId: call.id }, select: { id: true } })
  if (existing) return { chatLogId: existing.id, callLogId: null, alreadyExists: true }

  let patientId = await findPatientIdByPhone(visitorPhone)
  if (!patientId && visitorEmail) {
    const m = await prisma.patient.findMany({ where: { email: { equals: visitorEmail, mode: 'insensitive' } }, select: { id: true }, take: 2 })
    if (m.length === 1) patientId = m[0].id
  }
  const combined = `${summary} ${transcript}`
  const chatOutcome = inferChatOutcome(summary, transcript, report.endedReason, mapped.length)
  let chatLogId: string
  try {
    const chatLog = await prisma.chatLog.create({
      data: {
        sessionId: call.id,
        visitorName,
        visitorEmail,
        visitorPhone,
        startTime,
        endTime,
        messageCount: mapped.length,
        topic: inferTopic(combined),
        outcome: chatOutcome,
        messages: JSON.parse(JSON.stringify(mapped)),
        summary: summary || null,
        sourcePage: null,
        deviceType: call.type === 'webCall' ? 'Desktop' : null,
        browser: null,
        leadCaptured: chatOutcome === 'LEAD_CAPTURED',
        appointmentBooked: chatOutcome === 'BOOKED',
        patientId,
      },
    })
    chatLogId = chatLog.id
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.chatLog.findUnique({ where: { sessionId: call.id }, select: { id: true } })
      return { chatLogId: winner?.id ?? null, callLogId: null, alreadyExists: true }
    }
    throw err
  }

  await prisma.auditLog.create({
    data: {
      userId: null, action: 'CREATE', entity: 'chat_log', entityId: chatLogId,
      changes: { source: 'vapi_webhook', vapiCallId: call.id, callType: call.type ?? 'webCall' },
      ipAddress: requestIp, userAgent: 'Vapi-Webhook', timestamp: new Date(),
    },
  })
  return { chatLogId, callLogId: null }
}
