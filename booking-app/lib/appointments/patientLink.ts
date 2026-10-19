/**
 * The patient's own link (/c/<token>) from confirmations and reminders: confirm, cancel or ask
 * to reschedule — no login. The token is scoped to one appointment and shows only date, time,
 * dentist and clinic.
 */
import { timingSafeEqual } from 'node:crypto'
import prisma from '@/lib/prisma'
import type { ClinicSettings } from '@/lib/clinic/settings'
import { setAppointmentStatus } from '@/lib/appointments/booking'
import { appointmentLinkToken, hashLinkToken } from '@/lib/appointments/notifications'
import { emailStaffAlert } from '@/lib/notifications/staffEmail'
import { notifyStaffInApp } from '@/lib/notifications/inApp'
import { formatDateLong, formatTime } from '@/lib/clinic/time'

export const TOKEN_RE = /^[0-9A-Za-z]{12}$/

export type LinkState = 'active' | 'confirmed' | 'cancelled' | 'past'

export async function findByToken(token: string) {
  if (!TOKEN_RE.test(token)) return null
  const appt = await prisma.appointment.findUnique({
    where: { publicTokenHash: hashLinkToken(token) },
    select: {
      id: true, startTime: true, endTime: true, status: true, provider: true, patientId: true, confirmedAt: true,
      patient: { select: { firstName: true, lastName: true, phone: true } },
    },
  })
  if (!appt) return null
  // Defence in depth: the token must be the one derived for this id.
  const expected = Buffer.from(appointmentLinkToken(appt.id))
  const given = Buffer.from(token)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  return appt
}

export function linkState(appt: { status: string; endTime: Date }, now = new Date()): LinkState {
  if (appt.endTime.getTime() < now.getTime()) return 'past'
  if (appt.status === 'CANCELLED' || appt.status === 'NO_SHOW' || appt.status === 'RESCHEDULED') return 'cancelled'
  if (appt.status === 'CONFIRMED' || appt.status === 'COMPLETED') return 'confirmed'
  return 'active'
}

export type LinkAction = 'confirm' | 'cancel' | 'reschedule'

export async function applyLinkAction(token: string, action: LinkAction, settings: ClinicSettings, now = new Date()): Promise<{ ok: boolean; state: LinkState; message: string; lateNotice?: boolean }> {
  const appt = await findByToken(token)
  if (!appt) return { ok: false, state: 'past', message: 'Ligação inválida ou expirada.' }
  const state = linkState(appt, now)
  if (state === 'past') return { ok: false, state, message: 'Esta consulta já passou.' }
  if (state === 'cancelled') return { ok: false, state, message: 'Esta consulta já foi desmarcada.' }
  const when = `${formatDateLong(appt.startTime, settings.timezone, settings.locale)} às ${formatTime(appt.startTime, settings.timezone, settings.locale)}`
  const name = `${appt.patient.firstName} ${appt.patient.lastName}`.trim()

  if (action === 'confirm') {
    if (state === 'confirmed') return { ok: true, state, message: 'A sua presença já está confirmada. Obrigado!' }
    const r = await setAppointmentStatus(appt.id, { status: 'CONFIRMED', via: 'link' }, { kind: 'PATIENT' }, { settings, now })
    if (!r.ok) return { ok: false, state, message: 'Não foi possível confirmar. Ligue-nos, por favor.' }
    return { ok: true, state: 'confirmed', message: 'Presença confirmada. Até breve!' }
  }

  if (action === 'cancel') {
    const r = await setAppointmentStatus(appt.id, { status: 'CANCELLED', reason: 'Desmarcada pelo paciente (link)' }, { kind: 'PATIENT' }, { settings, now })
    if (!r.ok) return { ok: false, state, message: 'Não foi possível desmarcar. Ligue-nos, por favor.' }
    const late = 'lateNotice' in r && r.lateNotice
    notifyStaffInApp({
      audience: 'staff',
      type: 'appointment_cancelled',
      title: late ? 'Late cancellation by patient (link)' : 'Patient cancelled (link)',
      message: `${name} — ${when}.`,
      icon: 'alert',
      actionUrl: `/appointments?appointment=${appt.id}`,
      entityType: 'appointment',
      entityId: appt.id,
    }).catch((err: Error) => console.error('[patient-link] notification failed:', err.message))
    void emailStaffAlert('cancellation', `${late ? 'Desmarcação tardia' : 'Desmarcação'} pelo paciente: ${appt.patient.firstName}, ${when}`, [
      `${appt.patient.firstName} desmarcou a consulta de ${when} através do link do lembrete.`,
      late ? `Aviso com menos de ${settings.bookingPolicy.cancellationNoticeHours} horas de antecedência.` : 'Aviso dentro do prazo.',
    ])
    return {
      ok: true,
      state: 'cancelled',
      lateNotice: late,
      message: late
        ? `Consulta desmarcada. Como faltam menos de ${settings.bookingPolicy.cancellationNoticeHours} horas, a clínica foi informada.`
        : 'Consulta desmarcada. Para marcar outra data, ligue-nos.',
    }
  }

  // reschedule: the desk calls back (self-service picking is a later phase)
  const existing = await prisma.callbackRequest.findFirst({
    where: { patientId: appt.patientId, status: { in: ['OPEN', 'IN_PROGRESS'] }, reason: { startsWith: 'Pedido de remarcação' } },
    select: { id: true },
  })
  if (!existing) {
    const cb = await prisma.callbackRequest.create({
      data: {
        callerName: name,
        phone: appt.patient.phone ?? '',
        reason: `Pedido de remarcação (link do lembrete) — consulta de ${when}.`,
        urgency: 'NORMAL',
        source: 'PATIENT_LINK',
        patientId: appt.patientId,
      },
    })
    await prisma.appointmentEvent.create({ data: { appointmentId: appt.id, kind: 'RESCHEDULE_REQUESTED', actor: 'PATIENT', data: { callbackId: cb.id } } })
    notifyStaffInApp({
      audience: 'staff',
      type: 'callback_request',
      title: `Reschedule request: ${name}`,
      message: `From the reminder link — appointment ${when}.`,
      icon: 'phone',
      actionUrl: '/callbacks',
      entityType: 'callback_request',
      entityId: cb.id,
    }).catch((err: Error) => console.error('[patient-link] notification failed:', err.message))
  }
  return { ok: true, state, message: 'Pedido registado. A receção vai ligar-lhe para combinar nova data. A consulta atual mantém-se até lá.' }
}
