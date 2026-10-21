/**
 * Merge two patient records (duplicates from Zappy, or a record the appointment import made for a
 * name several patients share). Everything that belongs to the source moves to the target, the
 * target's empty fields are filled from the source, and the source is deleted — in one transaction.
 *
 * Imported bookings are re-keyed to the target (lib/import/zappy.ts bookingKey) and the source's
 * identities become aliases of the target, so a later Zappy import neither re-creates the source
 * nor duplicates its bookings. A booking the target already has is dropped instead of doubled.
 */
import prisma from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'
import { utcToZoned } from '@/lib/clinic/time'
import { bookingKey, nameKey } from '@/lib/import/zappy'

/** Copied to the target only where the target has nothing. */
const FILL_FIELDS = [
  'middleName', 'dateOfBirth', 'gender', 'phone', 'phoneNote', 'phone2', 'phone2Note', 'email', 'address', 'city', 'state', 'zipCode',
  'parentName', 'parentRelation', 'parentPhone', 'parentEmail', 'parent2Name', 'parent2Relation', 'parentPhone2', 'parent2Email',
  'emergencyContact', 'emergencyPhone', 'insuranceProvider', 'insuranceId', 'insurancePlanType', 'insurancePlan', 'insuranceMemberId',
  'allergies', 'medications', 'medicalNotes', 'preferredProvider', 'nif', 'clientSource', 'referredBy', 'invoiceName', 'invoiceNotes',
  'birthDay', 'birthMonth', 'secondaryLanguage',
] as const

export type MergeSummary = {
  appointments: number
  duplicateAppointmentsDropped: number
  notes: number
  other: number
  fieldsFilled: string[]
  aliases: string[]
}

export class MergeError extends Error {}

const empty = (v: unknown) => v === null || v === undefined || v === ''

export async function mergePatients(sourceId: string, targetId: string, opts: { userId: string; timeZone: string }): Promise<MergeSummary> {
  if (sourceId === targetId) throw new MergeError('Choose a different patient to merge into.')
  return prisma.$transaction(async (tx) => {
    const [s, t] = await Promise.all([
      tx.patient.findUnique({ where: { id: sourceId }, include: { unsubscribe: true, conversation: { select: { id: true } } } }),
      tx.patient.findUnique({ where: { id: targetId }, include: { unsubscribe: true, conversation: { select: { id: true } } } }),
    ])
    if (!s || !t) throw new MergeError('One of the two patients no longer exists.')

    // ── Fields: fill the target's gaps; refusals and flags from either record win ──
    const data: Prisma.PatientUpdateInput = {}
    const filled: string[] = []
    for (const k of FILL_FIELDS) {
      if (empty(t[k]) && !empty(s[k])) {
        ;(data as Record<string, unknown>)[k] = s[k]
        filled.push(k)
      }
    }
    const tags = [...new Set([...t.tags, ...s.tags])]
    if (tags.length !== t.tags.length) data.tags = tags
    if (t.consents === null && s.consents !== null) data.consents = s.consents as Prisma.InputJsonValue
    if (!s.smsRemindersEnabled && t.smsRemindersEnabled) data.smsRemindersEnabled = false
    if (!s.emailRemindersEnabled && t.emailRemindersEnabled) data.emailRemindersEnabled = false
    if (s.smsOptOut && !t.smsOptOut) data.smsOptOut = true
    if (s.privateMode && !t.privateMode) data.privateMode = true
    if (s.patientSince < t.patientSince) data.patientSince = s.patientSince

    // ── Identities: the target takes the source's Zappy client id if it has none; the rest become
    // aliases. A booking-made key (zappy:n:) is never handed over — it would mark a real patient as
    // "made from a booking".
    let targetExternal = t.externalId
    const aliasIds = new Set<string>()
    if (s.externalId) {
      if (!t.externalId && !s.externalId.startsWith('zappy:n:')) targetExternal = s.externalId
      else aliasIds.add(s.externalId)
    }
    const sName = nameKey(`${s.firstName} ${s.lastName}`)
    if (sName && sName !== targetExternal) aliasIds.add(sName)
    const identity = targetExternal ?? t.id

    // ── Appointments: re-key imported bookings to the target; drop exact duplicates ──
    let moved = 0
    let dropped = 0
    const appts = await tx.appointment.findMany({ where: { patientId: s.id }, select: { id: true, externalId: true, startTime: true, reason: true } })
    for (const a of appts) {
      let externalId = a.externalId
      if (a.externalId?.startsWith('zappy:h:')) {
        const z = utcToZoned(a.startTime, opts.timeZone)
        externalId = bookingKey(identity, z.date, z.time, a.reason ?? '')
        const clash = await tx.appointment.findUnique({ where: { externalId }, select: { id: true } })
        if (clash) {
          await tx.appointment.delete({ where: { id: a.id } })
          dropped++
          continue
        }
      }
      await tx.appointment.update({ where: { id: a.id }, data: { patientId: t.id, externalId } })
      moved++
    }

    // ── Everything else that points at the source ──
    const where = { patientId: s.id }
    const to = { patientId: t.id }
    const notes = (await tx.patientNote.updateMany({ where, data: to })).count
    const counts = await Promise.all([
      tx.appointmentNotification.updateMany({ where, data: to }),
      tx.callLog.updateMany({ where, data: to }),
      tx.chatLog.updateMany({ where, data: to }),
      tx.document.updateMany({ where, data: to }),
      tx.intakeForm.updateMany({ where, data: to }),
      tx.emailLog.updateMany({ where, data: to }),
      tx.patientPortalSession.updateMany({ where, data: to }),
      tx.sMSOptOut.updateMany({ where, data: to }),
      tx.callbackRequest.updateMany({ where, data: to }),
      tx.waitlistEntry.updateMany({ where, data: to }),
    ])
    if (s.unsubscribe) {
      if (t.unsubscribe) await tx.unsubscribe.delete({ where: { patientId: s.id } })
      else await tx.unsubscribe.update({ where: { patientId: s.id }, data: to })
    }
    if (s.conversation) {
      if (t.conversation) {
        await tx.message.updateMany({ where: { conversationId: s.conversation.id }, data: { conversationId: t.conversation.id } })
        await tx.conversation.delete({ where: { id: s.conversation.id } })
      } else {
        await tx.conversation.update({ where: { id: s.conversation.id }, data: to })
      }
    }
    // Aliases that pointed at the source now point at the target.
    await tx.patientAlias.updateMany({ where, data: to })

    // ── Remove the source, then give the target its new identity and aliases ──
    await tx.patient.delete({ where: { id: s.id } })
    if (targetExternal !== t.externalId) data.externalId = targetExternal
    for (const id of aliasIds) {
      await tx.patientAlias.upsert({ where: { externalId: id }, create: { externalId: id, patientId: t.id }, update: { patientId: t.id } })
    }

    // Visits from completed appointments; Zappy's own last-visit date kept when later.
    const done = await tx.appointment.aggregate({ where: { patientId: t.id, status: 'COMPLETED' }, _count: true, _max: { startTime: true } })
    data.totalVisits = done._count
    const last = [t.lastVisitAt, s.lastVisitAt, done._max.startTime].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0]
    if (last) data.lastVisitAt = last
    await tx.patient.update({ where: { id: t.id }, data })

    const sourceName = `${s.firstName} ${s.lastName}`.trim()
    await tx.patientNote.create({
      data: {
        patientId: t.id, authorId: opts.userId, noteType: 'ADMINISTRATIVE',
        content: `Registo "${sourceName}"${s.externalId?.startsWith('zappy:') && !s.externalId.startsWith('zappy:n:') ? ` (Zappy nº ${s.externalId.slice(6)})` : ''} fundido nesta ficha: ${moved} marcação(ões)${dropped ? `, ${dropped} repetida(s) removida(s)` : ''}, ${notes} nota(s).`,
      },
    })
    await tx.auditLog.create({
      data: {
        userId: opts.userId, action: 'UPDATE', entity: 'patient_merge', entityId: t.id,
        changes: { mergedFrom: s.id, sourceName, moved, dropped, notes, filled, aliases: [...aliasIds] } as Prisma.InputJsonValue,
        timestamp: new Date(),
      },
    })
    return {
      appointments: moved,
      duplicateAppointmentsDropped: dropped,
      notes,
      other: counts.reduce((n, c) => n + c.count, 0),
      fieldsFilled: filled,
      aliases: [...aliasIds],
    }
  }, { timeout: 30_000 })
}
