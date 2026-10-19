/**
 * Zappy → CRM import, shared by the Patients → "Import from Zappy" upload and
 * scripts/import-zappy.ts.
 *
 * Dry run (commit: false) reads everything and writes nothing. Commit is idempotent: rows are
 * matched by Zappy id (then NIF, then phone + name), so running it again only applies what
 * changed. With a `deadline`, a commit stops cleanly when time runs out and returns
 * `complete: false` — calling it again with the same files continues where it stopped (rows
 * already imported are recognised as unchanged), which keeps each web request short.
 */
import { createHash } from 'node:crypto'
import prisma from '@/lib/prisma'
import type { AppointmentStatus, AppointmentType, Prisma } from '@/lib/generated/prisma/client'
import { APPOINTMENT_TYPE_KEYS, getClinicSettings } from '@/lib/clinic/settings'
import { todayInZone, utcToZoned, zonedTimeToUtc } from '@/lib/clinic/time'
import { phoneKey } from '@/lib/clinic/phone'
import { encrypt } from '@/lib/crypto'
import { csvRecords, decodeCsvBytes } from '@/lib/import/csv'
import {
  BOOKING_COLUMNS, CLIENT_COLUMNS, type ZappyMap, mapClientRow, mapService, mapStaff, mapStatus, norm, parseDate,
  parseDuration, parseTime, phoneE164, pick, resolveColumns, splitName, titleCase,
} from '@/lib/import/zappy'
import { createAppointment, setAppointmentStatus } from '@/lib/appointments/booking'
import { replanUpcoming } from '@/lib/appointments/replan'

export type ReportRow = { file: string; row: number; action: string; entity: string; externalId: string; name: string; detail: string }

export type ImportInput = {
  clients?: Uint8Array | null
  bookings?: Uint8Array | null
  map: ZappyMap
  commit: boolean
  createNextFromClients?: boolean
  cancelMissing?: boolean
  /** Epoch ms: stop a commit before this (web requests). */
  deadline?: number
  /** Staff user running it (note author, audit). Defaults to the first active admin. */
  userId?: string | null
}

export type ImportResult = {
  commit: boolean
  /** false when a commit stopped at the deadline — run it again with the same files. */
  complete: boolean
  clients: { rows: number; columns: Record<string, string>; unused: string[] } | null
  bookings: { rows: number; columns: Record<string, string>; unused: string[] } | null
  counts: Record<string, number>
  report: ReportRow[]
  bookingStatuses: Record<string, number>
  unknownServices: { name: string; count: number }[]
  unknownStaff: { name: string; count: number }[]
  upcomingPerDay: { date: string; count: number }[]
  missingFromExport: number
  nextOnlyOnClients: { missing: number; created: number }
  remindersPlanned: { appointments: number; messages: number } | null
}

export class ImportError extends Error {}

/** Mapping file / form → validated map (unknown types refused; dentists checked against Settings). */
export function normaliseMap(raw: Partial<ZappyMap> | null | undefined, providerIds: string[]): ZappyMap {
  const map: ZappyMap = {
    services: raw?.services ?? {},
    staff: raw?.staff ?? {},
    defaultType: (raw?.defaultType ?? 'OTHER') as AppointmentType,
    defaultProviderId: raw?.defaultProviderId ?? null,
  }
  for (const [name, type] of Object.entries(map.services)) {
    if (!(APPOINTMENT_TYPE_KEYS as readonly string[]).includes(type)) throw new ImportError(`Mapping: service "${name}" → unknown type ${type}`)
  }
  if (!(APPOINTMENT_TYPE_KEYS as readonly string[]).includes(map.defaultType)) throw new ImportError(`Mapping: unknown default type ${map.defaultType}`)
  for (const [name, id] of Object.entries(map.staff)) {
    if (!providerIds.includes(id)) throw new ImportError(`Mapping: staff "${name}" → unknown dentist id "${id}" (Settings → Practice → Dentists)`)
  }
  if (map.defaultProviderId && !providerIds.includes(map.defaultProviderId)) throw new ImportError(`Mapping: default dentist "${map.defaultProviderId}" is not a dentist id`)
  return map
}

export async function runZappyImport(input: ImportInput): Promise<ImportResult> {
  const COMMIT = input.commit
  const report: ReportRow[] = []
  const note = (r: ReportRow) => report.push(r)
  const counts = new Map<string, number>()
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1)
  const outOfTime = () => COMMIT && input.deadline !== undefined && Date.now() > input.deadline

  const settings = await getClinicSettings()
  const tz = settings.timezone
  const map = input.map
  const result: ImportResult = {
    commit: COMMIT, complete: true, clients: null, bookings: null, counts: {}, report, bookingStatuses: {}, unknownServices: [], unknownStaff: [],
    upcomingPerDay: [], missingFromExport: 0, nextOnlyOnClients: { missing: 0, created: 0 }, remindersPlanned: null,
  }
  const finish = () => {
    result.counts = Object.fromEntries([...counts].sort())
    return result
  }

  const author = input.userId
    ? { id: input.userId }
    : await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  if (!author) throw new ImportError('No active admin user — imported notes need an author.')

  // Existing patients, indexed for matching.
  const existing = await prisma.patient.findMany({
    select: {
      id: true, firstName: true, lastName: true, phone: true, phone2: true, email: true, nif: true, externalId: true, dateOfBirth: true,
      birthDay: true, birthMonth: true, address: true, city: true, zipCode: true, gender: true, clientSource: true, referredBy: true,
      invoiceName: true, invoiceNotes: true, phoneNote: true, phone2Note: true, tags: true, lastVisitAt: true,
      smsRemindersEnabled: true, emailRemindersEnabled: true, consents: true,
    },
  })
  type P = (typeof existing)[number]
  const byExternal = new Map<string, P>()
  const byNif = new Map<string, P>()
  const byPhone = new Map<string, P[]>()
  const index = (p: P) => {
    if (p.externalId) byExternal.set(p.externalId, p)
    if (p.nif) byNif.set(p.nif.replace(/\D/g, ''), p)
    for (const ph of [p.phone, p.phone2]) {
      const k = phoneKey(ph)
      if (k) byPhone.set(k, [...(byPhone.get(k) ?? []), p])
    }
  }
  existing.forEach(index)
  const sameName = (a: { firstName: string; lastName: string }, b: { firstName: string; lastName: string }) =>
    norm(a.firstName).split(' ')[0] === norm(b.firstName).split(' ')[0] && norm(a.lastName).split(' ').at(-1) === norm(b.lastName).split(' ').at(-1)

  const nextFromClients: { patientId: string; name: string; externalId: string; date: string; time: string | null }[] = []
  let tempSeq = 0
  const today = todayInZone(tz)

  // ── Clients ──
  if (input.clients) {
    const { headers, records } = csvRecords(decodeCsvBytes(input.clients))
    const cols = resolveColumns(headers, CLIENT_COLUMNS)
    result.clients = { rows: records.length, columns: cols as Record<string, string>, unused: headers.filter((h) => !Object.values(cols).includes(h)) }
    if (!cols.name && !cols.fullName && !cols.firstName) throw new ImportError('Clients file: no name column found. Is this the Zappy customers export?')

    for (const [i, rec] of records.entries()) {
      if (outOfTime()) {
        result.complete = false
        return finish()
      }
      const rowNo = i + 2
      const m = mapClientRow(rec, cols, today)
      if ('reject' in m) {
        bump('clients.rejected')
        note({ file: 'clients', row: rowNo, action: 'reject', entity: 'patient', externalId: pick(rec, cols, 'id'), name: '', detail: m.reject })
        continue
      }
      const { externalId, patient: data, warnings } = m
      const display = `${data.firstName} ${data.lastName}`.trim()
      const base = { file: 'clients', row: rowNo, entity: 'patient', externalId: externalId ?? '', name: display }
      const { patientSince, lastVisitAt, consents, ...fields } = data

      // Match: Zappy id → NIF → phone + name
      let match: P | undefined = externalId ? byExternal.get(externalId) : undefined
      let how = 'zappy id'
      if (!match && data.nif) { match = byNif.get(data.nif); how = 'NIF' }
      if (!match && data.phone) { match = (byPhone.get(phoneKey(data.phone)!) ?? []).find((p) => sameName(p, data)); how = 'phone + name' }

      if (match && externalId && match.externalId && match.externalId !== externalId) {
        // Two Zappy records for one person (Zappy duplicates): keep the first, report.
        bump('clients.duplicate')
        note({ ...base, action: 'duplicate', detail: `same person as ${match.externalId} (${how}) — merge in Zappy or ignore` })
        continue
      }

      let patientId: string
      let firstLink = false
      if (match) {
        // Zappy is the source of truth for records it created; CRM-made records only get gaps filled.
        const fromZappy = match.externalId === externalId && !!externalId
        firstLink = !match.externalId
        const patch: Prisma.PatientUpdateInput = {}
        // Key order doesn't matter (Postgres JSONB reorders object keys).
        const stable = (v: unknown): string =>
          v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)
            ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`
            : JSON.stringify(v ?? null)
        const same = (a: unknown, b: unknown) =>
          a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : stable(a) === stable(b)
        const empty = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
        for (const [k, v] of Object.entries(fields) as [keyof typeof fields, unknown][]) {
          if (empty(v)) continue
          const cur = (match as Record<string, unknown>)[k]
          if (cur === undefined && !(k in match)) continue
          if (fromZappy ? !same(cur, v) : empty(cur)) (patch as Record<string, unknown>)[k] = v
        }
        if (consents && (firstLink || (fromZappy && !same(match.consents, consents)))) patch.consents = consents as unknown as Prisma.InputJsonValue
        // A refusal in Zappy always wins, even on records first created in the CRM.
        if (!data.smsRemindersEnabled && match.smsRemindersEnabled) patch.smsRemindersEnabled = false
        if (!data.emailRemindersEnabled && match.emailRemindersEnabled) patch.emailRemindersEnabled = false
        if (!match.externalId && externalId) patch.externalId = externalId
        const changed = Object.keys(patch)
        bump(changed.length ? (fromZappy ? 'clients.updated' : 'clients.merged') : 'clients.unchanged')
        note({ ...base, action: changed.length ? (fromZappy ? 'update' : 'merge') : 'unchanged', detail: [changed.length ? `fields: ${changed.join(', ')}` : '', `matched by ${how}`, ...warnings].filter(Boolean).join('; ') })
        if (COMMIT && changed.length) {
          await prisma.patient.update({ where: { id: match.id }, data: patch })
          Object.assign(match, patch)
        }
        if (!match.externalId && externalId) {
          match.externalId = externalId
          byExternal.set(externalId, match)
        }
        patientId = match.id
      } else {
        bump('clients.created')
        note({ ...base, action: 'create', detail: [data.tags.length ? `${data.tags.length} segment(s)` : '', ...warnings].filter(Boolean).join('; ') })
        patientId = `planned-${++tempSeq}`
        if (COMMIT) {
          const created = await prisma.patient.create({
            data: {
              ...fields,
              externalId,
              consents: (consents ?? undefined) as Prisma.InputJsonValue | undefined,
              ...(patientSince && { patientSince }),
              lastVisitAt,
              status: 'ACTIVE',
              createdById: author.id,
            },
          })
          patientId = created.id
        }
        index({ id: patientId, ...fields, externalId, lastVisitAt } as unknown as P)
        firstLink = true
      }
      if (m.nextAppointment) nextFromClients.push({ patientId, name: display, externalId: externalId ?? '', date: m.nextAppointment.date, time: m.nextAppointment.time })

      // Once per patient (first import or first link to Zappy): notes, follow-up, marketing opt-out
      if (firstLink) {
        if (m.notes.length) bump('clients.notes')
        if (m.followUp) {
          bump('clients.followUps')
          note({ ...base, action: 'follow-up', detail: m.followUp.reason })
        }
        if (COMMIT) {
          for (const text of m.notes) {
            await prisma.patientNote.create({ data: { patientId, authorId: author.id, content: `Importado do Zappy: ${text}`, noteType: 'ADMINISTRATIVE' } })
          }
          if (m.followUp) {
            await prisma.callbackRequest.create({
              data: {
                callerName: display, phone: data.phone ?? data.phone2 ?? '', reason: m.followUp.reason, urgency: 'NORMAL',
                source: 'IMPORT', patientId, dueAt: m.followUp.dueAt,
              },
            })
          }
          if (m.refusesCampaigns && data.email) {
            await prisma.unsubscribe.upsert({ where: { patientId }, create: { patientId, email: encrypt(data.email), reason: 'Zappy: sem consentimento para campanhas' }, update: {} })
          }
        }
      }
    }
  }

  // ── Bookings ──
  if (input.bookings) {
    const { headers, records } = csvRecords(decodeCsvBytes(input.bookings))
    const cols = resolveColumns(headers, BOOKING_COLUMNS)
    result.bookings = { rows: records.length, columns: cols as Record<string, string>, unused: headers.filter((h) => !Object.values(cols).includes(h)) }
    if (!cols.date) throw new ImportError('Bookings file: no date column found. Is this the Zappy appointment list?')

    const existingAppts = await prisma.appointment.findMany({
      where: { externalId: { startsWith: 'zappy:' } },
      select: { id: true, externalId: true, startTime: true, endTime: true, status: true, providerId: true, type: true },
    })
    const apptByExternal = new Map(existingAppts.map((a) => [a.externalId!, a]))
    const seen = new Set<string>()
    const unknownServices = new Map<string, number>()
    const unknownStaff = new Map<string, number>()
    const futurePerDay = new Map<string, number>()
    const statusCounts = new Map<string, number>()
    const now = new Date()
    let minDate = '9999-12-31'
    let maxDate = '0000-01-01'

    for (const [i, rec] of records.entries()) {
      if (outOfTime()) {
        result.complete = false
        return finish()
      }
      const rowNo = i + 2
      const clientName = titleCase(pick(rec, cols, 'clientName'))
      const base = { file: 'bookings', row: rowNo, entity: 'appointment', externalId: '', name: clientName }
      const d = parseDate(pick(rec, cols, 'date'))
      const start = parseTime(pick(rec, cols, 'start')) ?? d?.time ?? null
      if (!d || !start) {
        bump('bookings.rejected')
        note({ ...base, action: 'reject', detail: `date/time not recognised: "${pick(rec, cols, 'date')}" "${pick(rec, cols, 'start')}"` })
        continue
      }
      const service = pick(rec, cols, 'service')
      const svc = mapService(service, map)
      if (service && !svc.known) unknownServices.set(service, (unknownServices.get(service) ?? 0) + 1)
      const staffName = pick(rec, cols, 'staff')
      const st = mapStaff(staffName, map)
      if (staffName && !st.known) unknownStaff.set(staffName, (unknownStaff.get(staffName) ?? 0) + 1)
      const endRaw = parseTime(pick(rec, cols, 'end'))
      const typeCfg = settings.appointmentTypes.find((t) => t.type === svc.type)
      let duration = parseDuration(pick(rec, cols, 'duration')) ?? 0
      if (endRaw) {
        const [sh, sm] = start.split(':').map(Number)
        const [eh, em] = endRaw.split(':').map(Number)
        duration = eh * 60 + em - (sh * 60 + sm)
      }
      if (!duration || duration <= 0 || duration > 720) duration = typeCfg?.durationMinutes ?? 30

      // Patient: Zappy client id → phone + name → unique name → create a minimal record
      const zcid = pick(rec, cols, 'clientId')
      const rawPhone = pick(rec, cols, 'phone')
      const phone = rawPhone ? phoneE164(rawPhone) : null
      const nm = splitName(clientName)
      let patient: P | undefined = zcid ? byExternal.get(`zappy:${zcid}`) : undefined
      if (!patient && phone) patient = (byPhone.get(phoneKey(phone)!) ?? []).find((p) => sameName(p, nm))
      if (!patient && clientName) {
        const sameFull = [...byExternal.values(), ...existing].filter((p) => norm(`${p.firstName} ${p.lastName}`) === norm(clientName))
        const unique = [...new Map(sameFull.map((p) => [p.id, p])).values()]
        if (unique.length === 1) patient = unique[0]
      }
      if (!patient) {
        if (!clientName) {
          bump('bookings.rejected')
          note({ ...base, action: 'reject', detail: 'no client id, phone or name' })
          continue
        }
        bump('clients.createdFromBooking')
        const data = { firstName: titleCase(nm.firstName), lastName: titleCase(nm.lastName), phone, externalId: zcid ? `zappy:${zcid}` : null }
        note({ file: 'bookings', row: rowNo, entity: 'patient', externalId: data.externalId ?? '', name: clientName, action: 'create', detail: 'client only found in the bookings file' })
        let id = `planned-${++tempSeq}`
        if (COMMIT) {
          const created = await prisma.patient.create({ data: { ...data, status: 'ACTIVE', createdById: author.id } })
          id = created.id
        }
        patient = { id, ...data, email: null, nif: null, dateOfBirth: null, address: null, city: null, zipCode: null, gender: null, clientSource: null, tags: [], lastVisitAt: null } as unknown as P
        index(patient)
      }

      const bid = pick(rec, cols, 'id')
      const externalId = bid
        ? `zappy:${bid}`
        : `zappy:h:${createHash('sha1').update(`${patient.externalId ?? patient.id}|${d.date}|${start}|${norm(service)}`).digest('hex').slice(0, 12)}`
      base.externalId = externalId
      base.name = `${patient.firstName} ${patient.lastName}`.trim()
      if (seen.has(externalId)) {
        bump('bookings.duplicateRow')
        note({ ...base, action: 'skip', detail: 'same booking twice in the file' })
        continue
      }
      seen.add(externalId)

      const startUtc = zonedTimeToUtc(d.date, start, tz)
      const isPast = startUtc.getTime() < now.getTime()
      const mapped = mapStatus(pick(rec, cols, 'status'), isPast)
      statusCounts.set(mapped.status, (statusCounts.get(mapped.status) ?? 0) + 1)
      if (d.date < minDate) minDate = d.date
      if (d.date > maxDate) maxDate = d.date
      if (!isPast && (mapped.status === 'SCHEDULED' || mapped.status === 'CONFIRMED')) futurePerDay.set(d.date, (futurePerDay.get(d.date) ?? 0) + 1)
      const online = /online|app|website|site|@|instagram|facebook/i.test(pick(rec, cols, 'channel'))
      const notes = [pick(rec, cols, 'notes'), mapped.note, mapped.inferred ? '[Estado inferido na importação]' : null].filter(Boolean).join(' · ') || null

      const prior = apptByExternal.get(externalId)
      if (prior) {
        const endUtc = new Date(startUtc.getTime() + duration * 60_000)
        const diff: string[] = []
        if (prior.startTime.getTime() !== startUtc.getTime() || prior.endTime.getTime() !== endUtc.getTime()) diff.push('time')
        if (prior.status !== mapped.status && !(mapped.inferred && ['COMPLETED', 'NO_SHOW', 'CANCELLED'].includes(prior.status))) diff.push('status')
        if ((prior.providerId ?? null) !== st.providerId) diff.push('dentist')
        if (prior.type !== svc.type) diff.push('type')
        bump(diff.length ? 'bookings.updated' : 'bookings.unchanged')
        note({ ...base, action: diff.length ? 'update' : 'unchanged', detail: diff.join(', ') })
        if (COMMIT && diff.length) {
          const provider = settings.providers.find((p) => p.id === st.providerId) ?? null
          await prisma.$transaction(async (tx) => {
            await tx.appointment.update({
              where: { id: prior.id },
              data: {
                startTime: startUtc, endTime: endUtc, duration, type: svc.type, providerId: st.providerId, provider: provider?.name ?? null,
                ...(diff.includes('status') && { status: mapped.status as AppointmentStatus, ...(mapped.status === 'CANCELLED' && { cancelledAt: now, cancelReason: 'Cancelada no Zappy' }) }),
              },
            })
            await tx.appointmentEvent.create({ data: { appointmentId: prior.id, kind: 'UPDATED', actor: 'IMPORT', data: { fields: diff, source: 'zappy' } } })
          })
        }
        continue
      }

      bump('bookings.created')
      note({ ...base, action: 'create', detail: [`${d.date} ${start} ${duration}min ${svc.type} ${mapped.status}`, !svc.known && service ? `unknown service "${service}"` : '', !st.known && staffName ? `unknown staff "${staffName}"` : ''].filter(Boolean).join('; ') })
      if (COMMIT) {
        const r = await createAppointment(
          {
            patientId: patient.id, date: d.date, time: start, type: svc.type, durationMinutes: duration, providerId: st.providerId,
            reason: service || null, notes, status: mapped.status, bookedVia: online ? 'WEBSITE' : 'IMPORT', externalId, notifyPatient: false,
          },
          { kind: 'IMPORT' },
          { settings: { ...settings, flags: { ...settings.flags, reminders: false } }, now },
        )
        if (!r.ok) {
          bump('bookings.failed')
          note({ ...base, action: 'error', detail: r.message })
        } else if (mapped.status === 'CANCELLED') {
          await prisma.appointment.update({ where: { id: r.appointment.id }, data: { cancelledAt: r.appointment.startTime, cancelReason: mapped.note ?? 'Cancelada no Zappy' } })
        }
      }
    }

    // Bookings deleted in Zappy since the last import (future only, inside the exported range)
    const missing = existingAppts.filter((a) => {
      const day = utcToZoned(a.startTime, tz).date
      return !seen.has(a.externalId!) && day >= today && day >= minDate && day <= maxDate && (a.status === 'SCHEDULED' || a.status === 'CONFIRMED')
    })
    result.missingFromExport = missing.length
    for (const a of missing) {
      note({ file: 'bookings', row: 0, entity: 'appointment', externalId: a.externalId!, name: '', action: input.cancelMissing ? 'cancel' : 'missing', detail: utcToZoned(a.startTime, tz).date })
      if (COMMIT && input.cancelMissing) {
        await setAppointmentStatus(a.id, { status: 'CANCELLED', reason: 'Removida no Zappy', notifyPatient: false }, { kind: 'IMPORT' }, { settings })
      }
    }

    result.bookingStatuses = Object.fromEntries(statusCounts)
    result.unknownServices = [...unknownServices].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
    result.unknownStaff = [...unknownStaff].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
    result.upcomingPerDay = [...futurePerDay].sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count }))
  }

  // ── Upcoming appointments Zappy shows on the client record ──
  for (const n of nextFromClients) {
    if (outOfTime()) {
      result.complete = false
      return finish()
    }
    if (n.patientId.startsWith('planned-')) {
      // Dry run: the patient doesn't exist yet, so nothing can be booked for them either.
      result.nextOnlyOnClients.missing++
      note({ file: 'clients', row: 0, entity: 'appointment', externalId: n.externalId, name: n.name, action: input.createNextFromClients && n.time ? 'create' : 'missing-next', detail: `${n.date} ${n.time ?? '(no time)'} — next appointment on the client record` })
      continue
    }
    const start = zonedTimeToUtc(n.date, '00:00', tz)
    const end = zonedTimeToUtc(n.date, '23:59', tz)
    const has = await prisma.appointment.count({ where: { patientId: n.patientId, startTime: { gte: start, lte: end }, status: { in: ['SCHEDULED', 'CONFIRMED'] } } })
    if (has) continue
    result.nextOnlyOnClients.missing++
    const canCreate = !!input.createNextFromClients && !!n.time
    note({ file: 'clients', row: 0, entity: 'appointment', externalId: n.externalId, name: n.name, action: canCreate ? 'create' : 'missing-next', detail: `${n.date} ${n.time ?? '(no time)'} — on the client record but not in the bookings export` })
    if (COMMIT && canCreate) {
      const r = await createAppointment(
        {
          patientId: n.patientId, date: n.date, time: n.time!, type: map.defaultType, providerId: map.defaultProviderId,
          notes: 'Criada a partir da próxima marcação da ficha Zappy (sem detalhes do serviço)', status: 'SCHEDULED',
          bookedVia: 'IMPORT', externalId: `zappy:next:${n.externalId || n.patientId}:${n.date}`, notifyPatient: false,
        },
        { kind: 'IMPORT' },
        { settings: { ...settings, flags: { ...settings.flags, reminders: false } } },
      )
      if (r.ok) result.nextOnlyOnClients.created++
      else note({ file: 'clients', row: 0, entity: 'appointment', externalId: n.externalId, name: n.name, action: 'error', detail: r.message })
    }
  }

  // ── After a complete commit ──
  if (COMMIT) {
    // Visits from completed appointments; Zappy's own "last appointment" kept when it is later.
    await prisma.$executeRaw`
      UPDATE "patients" p
         SET "total_visits" = COALESCE(s.n, 0),
             "last_visit_at" = GREATEST(s.last, p."last_visit_at")
        FROM (SELECT pa.id, COUNT(a.id)::int AS n, MAX(a."start_time") AS last
                FROM "patients" pa
                LEFT JOIN "appointments" a ON a."patient_id" = pa.id AND a."status" = 'COMPLETED'
               WHERE pa."external_id" LIKE 'zappy:%'
               GROUP BY pa.id) s
       WHERE p.id = s.id`
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? author.id, action: 'CREATE', entity: 'import', entityId: 'zappy',
        changes: JSON.parse(JSON.stringify({ counts: Object.fromEntries(counts), clientsRows: result.clients?.rows ?? 0, bookingsRows: result.bookings?.rows ?? 0 })),
        userAgent: 'import-zappy', timestamp: new Date(),
      },
    })
    if (settings.flags.reminders) result.remindersPlanned = await replanUpcoming(settings)
  }
  return finish()
}

export function reportCsv(rows: ReportRow[]): string {
  const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return ['file;row;action;entity;externalId;name;detail', ...rows.map((r) => [r.file, r.row, r.action, r.entity, r.externalId, r.name, r.detail].map((v) => esc(String(v))).join(';'))].join('\n')
}
