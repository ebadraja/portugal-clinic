/**
 * Bulk changes to the reminder outbox when the clinic switches reminders on or off, or edits
 * the reminder policy.
 */
import prisma from '@/lib/prisma'
import type { ClinicSettings } from '@/lib/clinic/settings'
import { applyPlan } from '@/lib/appointments/notifications'

/**
 * Rebuild reminders for every upcoming active appointment (no confirmations — those were for
 * the moment of booking). Used when reminders are switched on, after a policy change, and after
 * the Zappy import at cutover.
 */
export async function replanUpcoming(settings: ClinicSettings, now = new Date()): Promise<{ appointments: number; messages: number }> {
  const s = { ...settings, flags: { ...settings.flags, reminders: true } }
  let cursor: string | undefined
  let appointments = 0
  let messages = 0
  for (;;) {
    const batch = await prisma.appointment.findMany({
      where: { startTime: { gt: now }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
      orderBy: { id: 'asc' },
      take: 200,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
      select: { id: true, patientId: true, startTime: true, patient: { select: { phone: true, email: true, smsRemindersEnabled: true } } },
    })
    if (batch.length === 0) break
    for (const a of batch) {
      messages += await prisma.$transaction((tx) => applyPlan(tx, a, a.patient, { type: 'replan' }, s, now))
      appointments++
    }
    cursor = batch[batch.length - 1].id
  }
  return { appointments, messages }
}

/** Reminders switched off: nothing pending may go out later. */
export async function cancelAllPending(): Promise<number> {
  const r = await prisma.appointmentNotification.updateMany({ where: { status: { in: ['PENDING', 'SENDING'] } }, data: { status: 'CANCELLED', error: 'reminders switched off' } })
  return r.count
}
