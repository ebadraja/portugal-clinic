/**
 * Voice-agent (Acácia) mid-call tools.
 *
 * Rules every tool follows:
 *  - Identity first: anything about a specific patient needs full name + DOB
 *    matching exactly one record (lib/voice/identity.ts). Results never contain
 *    the DOB, insurance or clinical notes.
 *  - Clinic wall time: dates/times are Europe/Lisbon (Settings.timezone).
 *  - The kill switch (Settings.voiceToolsPaused) stops every action except
 *    taking a callback and handing over to a human.
 *  - Results are short pt-PT sentences the agent can relay; they say what to do next.
 *  - Every booking change is audited with the Vapi call id, so the end-of-call
 *    report can file the true outcome from what actually happened.
 */
import prisma from '@/lib/prisma'
import type { AppointmentType, Prisma } from '@/lib/generated/prisma/client'
import {
  type ClinicSettings,
  type Provider,
  activeProviders,
  appointmentTypeConfig,
  closureOn,
  hoursFor,
  providerByName,
  providerDoesType,
} from '@/lib/clinic/settings'
import { busyFor, computeDaySlots, providerWindowsOn, type SlotIssue } from '@/lib/appointments/availability'
import { createAppointment, rescheduleAppointment, setAppointmentStatus, type Actor, type BookingFailure } from '@/lib/appointments/booking'
import {
  addDays,
  dayBoundsUtc,
  formatDateLong,
  formatDateStringLong,
  formatTime,
  isValidDateString,
  parseTimeInput,
  todayInZone,
  utcToZoned,
} from '@/lib/clinic/time'
import { maskPhone, toE164 } from '@/lib/clinic/phone'
import { verifyCaller, type VerifiedPatient, type VerifyOutcome } from '@/lib/voice/identity'
import { appendSystemMessage } from '@/lib/messaging/systemMessages'
import { emailStaffAlert } from '@/lib/notifications/staffEmail'

export type ToolContext = {
  callId: string | null
  /** Server-side caller ID from the provider payload — never taken from the model's arguments. */
  callerPhone: string | null
  settings: ClinicSettings
  now: Date
}

type Args = Record<string, unknown>

const str = (v: unknown, max = 300): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// ─── Shared wording ───────────────────────────────────────────────────────────

export function verificationRefusal(outcome: Exclude<VerifyOutcome['status'], 'verified'>): string {
  switch (outcome) {
    case 'needs_full_name':
      return 'Para confirmar a identidade preciso do nome completo do paciente (nome próprio e apelido) e da data de nascimento.'
    case 'needs_dob':
      return 'Para confirmar a identidade preciso da data de nascimento do paciente (dia, mês e ano).'
    case 'not_found':
      return 'Não encontrei nenhuma ficha com esse nome e data de nascimento. Peça para confirmar os dados uma vez. Se for um novo paciente, recolha o nome e o motivo e use create_callback_request com is_new_patient=true.'
    case 'ambiguous':
      return 'Não é possível confirmar a identidade por telefone com estes dados. Não partilhe informação; ofereça um pedido de chamada de volta da receção (create_callback_request).'
  }
}

const SLOT_REFUSALS: Record<SlotIssue, string> = {
  invalid_date: 'A data não é válida. Use o formato AAAA-MM-DD.',
  invalid_time: 'A hora não é válida. Use HH:MM (24 horas).',
  past: 'Esse horário já passou.',
  too_soon: 'Esse horário é demasiado próximo para marcar por telefone. Ofereça o próximo horário disponível.',
  too_far: 'Só é possível marcar com a antecedência máxima definida pela clínica. Sugira uma data mais próxima.',
  holiday: 'A clínica está encerrada nesse dia',
  closed: 'A clínica está encerrada nesse dia da semana.',
  outside_hours: 'Esse horário está fora do horário de funcionamento.',
  lunch: 'Esse horário coincide com a pausa de almoço.',
  provider_off: 'O médico não está de serviço a essa hora.',
  blocked: 'Esse horário não está disponível na agenda.',
  conflict: 'Esse horário já está ocupado.',
}

function slotRefusal(check: { reason: SlotIssue; detail?: string }): string {
  const base = SLOT_REFUSALS[check.reason]
  return check.reason === 'holiday' ? `${base} (${check.detail}).` : base
}

/** Refusal for a failed booking-service call, in the agent's words. */
function bookingRefusal(r: BookingFailure): string {
  if (r.code === 'slot' && r.reason) {
    const detail = r.issues?.find((i) => i.reason === r.reason)?.detail
    return `${slotRefusal({ reason: r.reason, detail })} Use check_availability para propor outro horário.`
  }
  if (r.code === 'not_found') return 'Não encontrei essa consulta. Confirme a data com o paciente.'
  return 'Não foi possível concluir o pedido. Ofereça um pedido de chamada de volta (create_callback_request).'
}

const voiceActor = (ctx: ToolContext): Actor => ({ kind: 'VOICE_AGENT', callId: ctx.callId })

export function hoursSummary(settings: ClinicSettings): string {
  const pt: Record<string, string> = {
    Monday: 'segunda', Tuesday: 'terça', Wednesday: 'quarta', Thursday: 'quinta', Friday: 'sexta', Saturday: 'sábado', Sunday: 'domingo',
  }
  const order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const lunch = settings.lunchBreak.enabled ? ` (encerrado das ${settings.lunchBreak.start} às ${settings.lunchBreak.end})` : ''
  const parts = order.map((day) => {
    const h = settings.businessHours.find((r) => r.day === day)
    return h?.enabled ? `${pt[day]} ${h.open}–${h.close}` : `${pt[day]} encerrado`
  })
  return `${parts.join('; ')}${lunch}.`
}

export function isOpenNow(settings: ClinicSettings, now: Date): boolean {
  const z = utcToZoned(now, settings.timezone)
  if (closureOn(z.date, settings.holidays)) return false
  const h = hoursFor(z.date, settings.businessHours)
  if (!h) return false
  const [oh, om] = h.open.split(':').map(Number)
  const [ch, cm] = h.close.split(':').map(Number)
  if (z.minutes < oh * 60 + om || z.minutes >= ch * 60 + cm) return false
  if (settings.lunchBreak.enabled) {
    const [lh, lm] = settings.lunchBreak.start.split(':').map(Number)
    const [eh, em] = settings.lunchBreak.end.split(':').map(Number)
    if (z.minutes >= lh * 60 + lm && z.minutes < eh * 60 + em) return false
  }
  return true
}

function typeLabel(type: string, settings: ClinicSettings): string {
  return appointmentTypeConfig(type, settings.appointmentTypes)?.label ?? 'consulta'
}

function apptPhrase(start: Date, settings: ClinicSettings): string {
  return `${formatDateLong(start, settings.timezone, settings.locale)} às ${formatTime(start, settings.timezone, settings.locale)}`
}

async function notifyStaff(input: {
  audience: 'admins' | 'staff'
  type: string
  title: string
  message: string
  icon: string
  actionUrl: string
  entityType?: string
  entityId?: string
}): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      approvalStatus: 'APPROVED',
      role: input.audience === 'admins' ? 'ADMIN' : { in: ['ADMIN', 'STAFF'] },
    },
    select: { id: true },
  })
  if (users.length === 0) return
  await prisma.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      type: input.type,
      title: input.title,
      message: input.message,
      icon: input.icon,
      actionUrl: input.actionUrl,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    })),
  })
}

function audit(action: 'CREATE' | 'UPDATE', entity: string, entityId: string, changes: Prisma.InputJsonValue): Promise<unknown> {
  return prisma.auditLog
    .create({ data: { userId: null, action, entity, entityId, changes, userAgent: 'Vapi-Tool', timestamp: new Date() } })
    .catch((err: Error) => console.error('[voice-tool] audit failed:', err.message))
}

/** The verify step every patient-specific tool starts with. */
async function requireVerified(args: Args, ctx: ToolContext): Promise<{ ok: true; patient: VerifiedPatient } | { ok: false; message: string }> {
  const dateOfBirth = args.date_of_birth ?? args.patient_dob
  const outcome = await verifyCaller({ fullName: args.full_name ?? args.patient_name ?? args.child_name, dateOfBirth, callerPhone: ctx.callerPhone })
  if (outcome.status !== 'verified') return { ok: false, message: verificationRefusal(outcome.status) }
  if (outcome.via === 'caller_id') {
    // The record has no DOB: ask the desk to confirm the one the caller gave (never written unchecked).
    notifyStaff({
      audience: 'staff',
      type: 'dob_to_confirm',
      title: 'Confirm date of birth',
      message: `${outcome.patient.firstName} ${outcome.patient.lastName} was identified by caller ID and gave their date of birth as ${String(dateOfBirth ?? '').slice(0, 20)}. Confirm it and add it to the record.`,
      icon: 'alert',
      actionUrl: `/patients/${outcome.patient.id}`,
      entityType: 'patient',
      entityId: outcome.patient.id,
    }).catch((err: Error) => console.error('[voice-tool] DOB notification failed:', err.message))
  }
  return { ok: true, patient: outcome.patient }
}

async function findActiveAppointmentOn(patientId: string, date: string, settings: ClinicSettings) {
  const { start, end } = dayBoundsUtc(date, settings.timezone)
  return prisma.appointment.findFirst({
    where: { patientId, startTime: { gte: start, lt: end }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
    orderBy: { startTime: 'asc' },
  })
}

/**
 * Who Acácia may book this type with: AI-bookable, active, does the type. A dentist the caller
 * named (or the patient's preferred one) comes first. Empty when the clinic has no dentists
 * configured — then the clinic is treated as one chair.
 */
function agentProviders(type: string, settings: ClinicSettings, hint?: string | null): Provider[] {
  const pool = activeProviders(settings).filter((p) => p.agentBookable && providerDoesType(p, type))
  const h = hint?.trim().toLowerCase()
  const wanted = h ? providerByName(h, pool) ?? pool.find((p) => p.name.toLowerCase().includes(h)) ?? null : null
  return wanted ? [wanted, ...pool.filter((p) => p.id !== wanted.id)] : pool
}

/** Free start times on a day across the given dentists (union), with the agent's rules. */
async function agentDaySlots(date: string, durationMinutes: number, bufferMinutes: number, providers: Provider[], ctx: ToolContext) {
  const runOne = async (provider: Provider | null) => {
    const busy = await busyFor(prisma, date, ctx.settings, { providerId: provider?.id ?? null })
    return computeDaySlots({
      date, durationMinutes, bufferMinutes, rules: ctx.settings, booked: busy.booked, blocks: busy.blocks,
      providerWindows: providerWindowsOn(date, provider), now: ctx.now, enforceNotice: true,
    })
  }
  const results = await Promise.all((providers.length > 0 ? providers : [null]).map(runOne))
  const times = [...new Set(results.flatMap((r) => r.slots.map((s) => s.startTime)))].sort()
  const closedReason = times.length > 0 ? null : results.find((r) => r.closedReason && r.closedReason !== 'provider_off')?.closedReason ?? results[0]?.closedReason ?? null
  return { slots: times.map((startTime) => ({ startTime })), closedReason }
}

function resolveType(raw: unknown, settings: ClinicSettings): { type: AppointmentType; durationMinutes: number; bufferMinutes: number; label: string; agentBookable: boolean } | null {
  const key = str(raw, 40).toUpperCase().replace(/[\s-]+/g, '_')
  const cfg = appointmentTypeConfig(key, settings.appointmentTypes)
  if (!cfg || !cfg.active) return null
  return { type: cfg.type as AppointmentType, durationMinutes: cfg.durationMinutes, bufferMinutes: cfg.bufferMinutes, label: cfg.label, agentBookable: cfg.agentBookable }
}

// ─── Tools ────────────────────────────────────────────────────────────────────

export async function toolLookupPatient(args: Args, ctx: ToolContext): Promise<string> {
  const v = await requireVerified(args, ctx)
  if (!v.ok) return v.message
  const next = await prisma.appointment.findFirst({
    where: { patientId: v.patient.id, startTime: { gt: ctx.now }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
    orderBy: { startTime: 'asc' },
    select: { startTime: true, type: true },
  })
  const nextText = next
    ? `Próxima consulta: ${typeLabel(next.type, ctx.settings)} em ${apptPhrase(next.startTime, ctx.settings)}.`
    : 'Não tem consultas marcadas.'
  return `Identidade confirmada: ${v.patient.firstName}. ${nextText}`
}

export async function toolCheckAvailability(args: Args, ctx: ToolContext): Promise<string> {
  const date = str(args.date, 10)
  if (!isValidDateString(date)) return 'Indique a data no formato AAAA-MM-DD.'

  let duration = ctx.settings.bookingPolicy.slotMinutes
  let buffer = 0
  let typeKey = 'EVALUATION'
  if (args.appointment_type) {
    const t = resolveType(args.appointment_type, ctx.settings)
    if (!t) return 'Esse tipo de consulta não está disponível. Ofereça uma consulta de avaliação.'
    if (!t.agentBookable) {
      return `${t.label}: este tipo de consulta é marcado pela equipa clínica. Ofereça uma consulta de avaliação ou um pedido de chamada de volta.`
    }
    duration = t.durationMinutes
    buffer = t.bufferMinutes
    typeKey = t.type
  }
  const providers = agentProviders(typeKey, ctx.settings, str(args.provider, 80) || null)

  const run = (d: string) => agentDaySlots(d, duration, buffer, providers, ctx)

  const first = await run(date)
  const list = (slots: { startTime: string }[]) => slots.slice(0, 6).map((s) => s.startTime).join(', ')
  if (first.slots.length > 0) {
    return `Horários livres em ${formatDateStringLong(date, ctx.settings.locale)} (${date}): ${list(first.slots)}.`
  }

  const why =
    first.closedReason === 'past' ? 'Essa data já passou.'
    : first.closedReason === 'too_far' ? 'Essa data ultrapassa o período de marcação.'
    : first.closedReason === 'closed' ? 'A clínica está encerrada nesse dia.'
    : first.closedReason === 'invalid_date' ? 'Data inválida.'
    : first.closedReason ? `A clínica está encerrada nesse dia (${first.closedReason}).`
    : 'Não há vagas nesse dia.'

  const startFrom = date < todayInZone(ctx.settings.timezone, ctx.now) ? todayInZone(ctx.settings.timezone, ctx.now) : date
  for (let i = 1; i <= 21; i++) {
    const d = addDays(startFrom, i)
    const r = await run(d)
    if (r.closedReason === 'too_far') break
    if (r.slots.length > 0) {
      return `${why} O próximo dia com vagas é ${formatDateStringLong(d, ctx.settings.locale)} (${d}): ${list(r.slots)}.`
    }
  }
  return `${why} Não encontrei vagas nas próximas três semanas. Ofereça um pedido de chamada de volta.`
}

export async function toolBookAppointment(args: Args, ctx: ToolContext): Promise<string> {
  const date = str(args.date, 10)
  const time = parseTimeInput(str(args.time, 20))
  if (!isValidDateString(date)) return 'Indique a data no formato AAAA-MM-DD.'
  if (!time) return 'Indique a hora no formato HH:MM (24 horas).'

  const t = resolveType(args.appointment_type ?? args.visit_type ?? 'EVALUATION', ctx.settings)
  if (!t) return 'Esse tipo de consulta não está disponível. Ofereça uma consulta de avaliação.'
  if (!t.agentBookable) {
    return `${t.label}: este tipo de consulta é marcado pela equipa clínica. Registe um pedido de chamada de volta (create_callback_request).`
  }

  const v = await requireVerified(args, ctx)
  if (!v.ok) {
    if (ctx.settings.bookingPolicy.newPatientMode === 'callback') {
      return `${v.message} Lembrete: novos pacientes não são marcados diretamente — a equipa confirma a disponibilidade e liga de volta.`
    }
    return v.message
  }
  const patient = v.patient
  const notes = str(args.notes, 500) || null

  const candidates = agentProviders(t.type, ctx.settings, str(args.provider, 80) || patient.preferredProvider)
  const result = await createAppointment(
    {
      patientId: patient.id,
      date,
      time,
      type: t.type,
      durationMinutes: t.durationMinutes,
      // The service tries each in turn; with none configured it books clinic-wide.
      providerCandidates: candidates.map((p) => p.id),
      reason: t.label,
      notes,
    },
    voiceActor(ctx),
    { settings: ctx.settings, now: ctx.now },
  )
  if (!result.ok) return bookingRefusal(result)
  const appt = result.appointment
  const when = apptPhrase(appt.startTime, ctx.settings)

  notifyStaff({
    audience: 'admins',
    type: 'appointment_booked',
    title: 'Voice agent booked an appointment',
    message: `${t.label} for ${patient.firstName} ${patient.lastName} — ${when}.`,
    icon: 'check',
    actionUrl: `/patients/${patient.id}`,
    entityType: 'appointment',
    entityId: appt.id,
  }).catch((err: Error) => console.error('[voice-tool] booking notification failed:', err.message))
  void emailStaffAlert('newBooking', `Nova marcação pelo assistente: ${patient.firstName}, ${when}`, [
    `O assistente de voz marcou ${t.label} para ${patient.firstName} — ${when}.`,
  ])
  appendSystemMessage({
    patientId: patient.id,
    content: `Consulta marcada pelo assistente de voz: ${t.label}, ${when}.`,
    metadata: { source: 'vapi', event: 'appointment_booked', appointmentId: appt.id },
  }).catch((err: Error) => console.error('[voice-tool] system message failed:', err.message))

  const p = ctx.settings.bookingPolicy
  return `Consulta marcada: ${t.label} para ${patient.firstName}, ${when}. Informe que pedimos aviso de pelo menos ${p.cancellationNoticeHours} horas para desmarcar e que a tolerância de atraso é de ${p.lateToleranceMinutes} minutos.`
}

export async function toolRescheduleAppointment(args: Args, ctx: ToolContext): Promise<string> {
  const currentDate = str(args.current_date ?? args.appointment_date, 10)
  const newDate = str(args.new_date, 10)
  const newTime = parseTimeInput(str(args.new_time, 20))
  if (!isValidDateString(currentDate) || !isValidDateString(newDate)) return 'Indique as datas no formato AAAA-MM-DD.'
  if (!newTime) return 'Indique a nova hora no formato HH:MM (24 horas).'

  const v = await requireVerified(args, ctx)
  if (!v.ok) return v.message

  const existing = await findActiveAppointmentOn(v.patient.id, currentDate, ctx.settings)
  if (!existing) return `Não encontrei nenhuma consulta ativa em ${formatDateStringLong(currentDate, ctx.settings.locale)}. Confirme a data com o paciente.`

  const result = await rescheduleAppointment(existing.id, { date: newDate, time: newTime }, voiceActor(ctx), { settings: ctx.settings, now: ctx.now })
  if (!result.ok) return bookingRefusal(result)
  const before = apptPhrase(existing.startTime, ctx.settings)
  const after = apptPhrase(result.appointment.startTime, ctx.settings)
  notifyStaff({
    audience: 'admins',
    type: 'appointment_rescheduled',
    title: 'Voice agent rescheduled an appointment',
    message: `${v.patient.firstName} ${v.patient.lastName}: ${before} → ${after}.`,
    icon: 'calendar',
    actionUrl: `/patients/${v.patient.id}`,
    entityType: 'appointment',
    entityId: existing.id,
  }).catch((err: Error) => console.error('[voice-tool] reschedule notification failed:', err.message))

  return `Consulta remarcada para ${after}.`
}

export async function toolCancelAppointment(args: Args, ctx: ToolContext): Promise<string> {
  const date = str(args.appointment_date ?? args.date, 10)
  if (!isValidDateString(date)) return 'Indique a data da consulta no formato AAAA-MM-DD.'
  const v = await requireVerified(args, ctx)
  if (!v.ok) return v.message

  const appt = await findActiveAppointmentOn(v.patient.id, date, ctx.settings)
  if (!appt) return `Não encontrei nenhuma consulta ativa em ${formatDateStringLong(date, ctx.settings.locale)}. Confirme a data com o paciente.`

  const reason = str(args.reason, 300) || 'Desmarcada pelo assistente de voz'
  const cancelled = await setAppointmentStatus(appt.id, { status: 'CANCELLED', reason }, voiceActor(ctx), { settings: ctx.settings, now: ctx.now })
  if (!cancelled.ok) return bookingRefusal(cancelled)
  const late = cancelled.lateNotice
  const when = apptPhrase(appt.startTime, ctx.settings)
  notifyStaff({
    audience: 'admins',
    type: 'appointment_cancelled',
    title: late ? 'Late cancellation via voice agent' : 'Voice agent cancelled an appointment',
    message: `${v.patient.firstName} ${v.patient.lastName} — ${when}. Reason: ${reason}${late ? ` (less than ${ctx.settings.bookingPolicy.cancellationNoticeHours}h notice)` : ''}`,
    icon: 'alert',
    actionUrl: `/patients/${v.patient.id}`,
    entityType: 'appointment',
    entityId: appt.id,
  }).catch((err: Error) => console.error('[voice-tool] cancel notification failed:', err.message))
  void emailStaffAlert('cancellation', `${late ? 'Desmarcação tardia' : 'Desmarcação'}: ${v.patient.firstName}, ${when}`, [
    `O assistente de voz desmarcou a consulta de ${v.patient.firstName} — ${when}.`,
    late ? `Aviso com menos de ${ctx.settings.bookingPolicy.cancellationNoticeHours} horas de antecedência.` : 'Aviso dentro do prazo.',
  ])
  appendSystemMessage({
    patientId: v.patient.id,
    content: `Consulta desmarcada pelo assistente de voz: ${when}.`,
    metadata: { source: 'vapi', event: 'appointment_cancelled', appointmentId: appt.id },
  }).catch((err: Error) => console.error('[voice-tool] system message failed:', err.message))

  const lateText = late
    ? ` A desmarcação foi feita com menos de ${ctx.settings.bookingPolicy.cancellationNoticeHours} horas de antecedência; a equipa foi informada.`
    : ''
  return `Consulta de ${when} desmarcada.${lateText} Pergunte se deseja marcar outra data.`
}

export async function toolCreateCallbackRequest(args: Args, ctx: ToolContext): Promise<string> {
  const callerName = str(args.caller_name ?? args.full_name, 120) || 'Desconhecido'
  const reason = str(args.reason, 1000)
  if (!reason) return 'Indique o motivo do pedido de chamada de volta.'
  const urgencyRaw = str(args.urgency, 10).toLowerCase()
  const urgency = urgencyRaw === 'urgent' ? 'URGENT' : urgencyRaw === 'low' ? 'LOW' : 'NORMAL'
  const isNewPatient = args.is_new_patient === true || args.is_new_patient === 'true'

  const phone = toE164(str(args.phone, 30)) ?? toE164(ctx.callerPhone)
  if (!phone) return 'Preciso de um número de telefone válido para a receção ligar de volta.'

  // One request per call + number: a retried tool call updates instead of duplicating.
  const existing = ctx.callId
    ? await prisma.callbackRequest.findFirst({ where: { vapiCallId: ctx.callId, phone }, select: { id: true } })
    : null
  const data = { callerName, phone, reason, urgency: urgency as 'URGENT' | 'LOW' | 'NORMAL', isNewPatient, source: 'VOICE_AGENT' as const, vapiCallId: ctx.callId }
  const cb = existing
    ? await prisma.callbackRequest.update({ where: { id: existing.id }, data })
    : await prisma.callbackRequest.create({ data })

  if (!existing) {
    await audit('CREATE', 'callback_request', cb.id, { source: 'voice_agent', vapiCallId: ctx.callId, urgency, isNewPatient })
    notifyStaff({
      audience: urgency === 'URGENT' ? 'staff' : 'admins',
      type: 'callback_request',
      title: `${urgency === 'URGENT' ? '[URGENT] ' : ''}Callback request: ${callerName}${isNewPatient ? ' (new patient)' : ''}`,
      message: `${maskPhone(phone)} — ${reason}`,
      icon: urgency === 'URGENT' ? 'alert' : 'phone',
      actionUrl: '/callbacks',
      entityType: 'callback_request',
      entityId: cb.id,
    }).catch((err: Error) => console.error('[voice-tool] callback notification failed:', err.message))
    if (urgency === 'URGENT') {
      void emailStaffAlert('escalation', `URGENTE — pedido de chamada: ${callerName}`, [`Pedido urgente registado pelo assistente de voz: ${callerName}.`, 'Veja os detalhes em Callbacks no CRM.'])
    } else if (isNewPatient) {
      void emailStaffAlert('newPatient', `Novo paciente — pedido de chamada: ${callerName}`, [`Novo paciente pediu contacto: ${callerName}.`, 'Veja os detalhes em Callbacks no CRM.'])
    }
  }

  const open = isOpenNow(ctx.settings, ctx.now)
  const when = open ? 'hoje, assim que possível' : 'no próximo período de atendimento'
  const urgentText =
    urgency === 'URGENT'
      ? ' Se houver dificuldade em respirar, inchaço que se espalha, hemorragia que não para ou traumatismo grave, deve ligar 112.'
      : ''
  return `Pedido registado. A receção vai ligar para o número terminado em ${phone.slice(-3)} ${when}.${urgentText}`
}

export async function toolTransferToHuman(args: Args, ctx: ToolContext): Promise<string> {
  const reason = str(args.reason, 300) || 'Pedido de transferência'
  const patientName = str(args.patient_name, 120)
  const notes = str(args.notes, 500)
  notifyStaff({
    audience: 'staff',
    type: 'transfer_context',
    title: `Incoming transfer${patientName ? `: ${patientName}` : ''}`,
    message: `${reason}${notes ? ` — ${notes}` : ''}`,
    icon: 'alert',
    actionUrl: '/call-logs',
  }).catch((err: Error) => console.error('[voice-tool] transfer notification failed:', err.message))
  void emailStaffAlert('escalation', 'Chamada a ser transferida para a receção', [`Motivo: ${reason}`])

  const target = ctx.settings.voiceAgent.transferPhone || ctx.settings.practice.phone
  if (!isOpenNow(ctx.settings, ctx.now)) {
    return `A clínica está fechada neste momento (horário: ${hoursSummary(ctx.settings)}). Não transfira; ofereça um pedido de chamada de volta (create_callback_request).`
  }
  return target
    ? `Contexto registado. Transfira a chamada para ${target}.`
    : 'Contexto registado, mas não há número de transferência configurado. Ofereça um pedido de chamada de volta.'
}

function insurerWords(s: string): string[] {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

/** "advance care" ≈ "AdvanceCare"; "cheque dentista do SNS" ≈ "SNS Cheque-Dentista" (word order free). */
function insurerMatches(query: string, name: string): boolean {
  const qWords = insurerWords(query)
  const nWords = insurerWords(name)
  const q = qWords.join('')
  const n = nWords.join('')
  if (!q || !n) return false
  if (q.includes(n) || (q.length >= 4 && n.includes(q))) return true
  const significant = nWords.filter((w) => w.length > 2)
  return significant.length > 0 && significant.every((w) => qWords.includes(w))
}

export function insuranceAnswer(planName: string, settings: ClinicSettings): string {
  if (insurerWords(planName).length === 0) return 'Indique o nome do seguro ou acordo.'
  const hit = (list: string[]) => list.find((p) => insurerMatches(planName, p))
  const note = settings.insurers.note ? ` ${settings.insurers.note}` : ''
  const refused = hit(settings.insurers.notAccepted)
  if (refused) return `Não trabalhamos com ${refused}.${note}`
  const accepted = hit(settings.insurers.accepted)
  if (accepted) return `Sim, trabalhamos com ${accepted}. A cobertura de cada tratamento é confirmada pela receção.`
  const list = settings.insurers.accepted.join(', ')
  return `Não tenho essa informação confirmada. Os acordos atuais são: ${list || 'nenhum registado'}. A receção pode confirmar.${note}`
}

export function openingHoursAnswer(settings: ClinicSettings, now: Date): string {
  const today = todayInZone(settings.timezone, now)
  const open = isOpenNow(settings, now)
  const upcoming: string[] = []
  for (let i = 0; i <= 30 && upcoming.length < 3; i++) {
    const d = addDays(today, i)
    const closure = closureOn(d, settings.holidays)
    if (closure && hoursFor(d, settings.businessHours)) upcoming.push(`${formatDateStringLong(d, settings.locale)} (${closure})`)
  }
  const closures = upcoming.length ? ` Próximos encerramentos: ${upcoming.join('; ')}.` : ''
  return `A clínica está ${open ? 'aberta' : 'fechada'} neste momento. Horário: ${hoursSummary(settings)}${closures}`
}

/** Simple, deterministic FAQ match: token overlap between the question and each approved item. */
export function rankKnowledge<T extends { question: string; answer: string; category: string; priority: number }>(question: string, items: T[]): T[] {
  const tokens = (s: string) =>
    new Set(
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9€]+/).filter((t) => t.length > 2),
    )
  const q = tokens(question)
  if (q.size === 0) return []
  return items
    .map((item) => {
      const t = tokens(`${item.question} ${item.category}`)
      let overlap = 0
      for (const w of q) if (t.has(w)) overlap++
      return { item, score: overlap / Math.max(3, q.size) + item.priority * 0.01 }
    })
    .filter((r) => r.score >= 0.34)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item)
}

export async function toolAnswerQuestion(args: Args): Promise<string> {
  const question = str(args.question, 300)
  if (!question) return 'Indique a pergunta.'
  const items = await prisma.knowledgeItem.findMany({
    where: { isActive: true },
    select: { id: true, question: true, answer: true, category: true, priority: true },
    take: 500,
  })
  const ranked = rankKnowledge(question, items).slice(0, 2)
  if (ranked.length === 0) {
    return 'Não tenho uma resposta aprovada pela clínica para essa pergunta. Não invente; ofereça um pedido de chamada de volta.'
  }
  prisma.knowledgeItem
    .updateMany({ where: { id: { in: ranked.map((r) => r.id) } }, data: { timesAsked: { increment: 1 }, lastAskedAt: new Date() } })
    .catch(() => {})
  return ranked.map((r) => r.answer).join(' ')
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

const ALLOWED_WHILE_PAUSED = new Set(['create_callback_request', 'transfer_to_human', 'get_opening_hours'])

export async function runVoiceTool(name: string, args: Args, ctx: ToolContext): Promise<string> {
  if (ctx.settings.voiceAgent.paused && !ALLOWED_WHILE_PAUSED.has(name)) {
    return 'O assistente está temporariamente limitado pela clínica: não pode consultar fichas nem marcar consultas. Ofereça um pedido de chamada de volta ou transfira para a receção.'
  }
  switch (name) {
    case 'lookup_patient':          return toolLookupPatient(args, ctx)
    case 'check_availability':      return toolCheckAvailability(args, ctx)
    case 'book_appointment':        return toolBookAppointment(args, ctx)
    case 'reschedule_appointment':  return toolRescheduleAppointment(args, ctx)
    case 'cancel_appointment':      return toolCancelAppointment(args, ctx)
    case 'create_callback_request': return toolCreateCallbackRequest(args, ctx)
    case 'transfer_to_human':       return toolTransferToHuman(args, ctx)
    case 'verify_insurance':        return insuranceAnswer(str(args.plan_name, 120), ctx.settings)
    case 'get_opening_hours':       return openingHoursAnswer(ctx.settings, ctx.now)
    case 'answer_question':         return toolAnswerQuestion(args)
    // Legacy pediatric tools — answered safely if an old assistant config still calls them.
    case 'submit_refill_request':
      return 'A clínica não trata pedidos de receitas por telefone. Ofereça um pedido de chamada de volta (create_callback_request).'
    case 'send_intake_forms':
      return toolCreateCallbackRequest({ caller_name: args.full_name ?? args.child_name ?? args.parent_name, phone: args.phone, reason: 'Pedido de envio de formulário de admissão' }, ctx)
    default:
      return `Ferramenta desconhecida: ${name}. Continue a conversa sem ela.`
  }
}
