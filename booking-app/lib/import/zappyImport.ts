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
import prisma from '@/lib/prisma'
import type { AppointmentStatus, AppointmentType, Prisma } from '@/lib/generated/prisma/client'
import { APPOINTMENT_TYPE_KEYS, getClinicSettings } from '@/lib/clinic/settings'
import { todayInZone, utcToZoned, zonedTimeToUtc } from '@/lib/clinic/time'
import { phoneKey } from '@/lib/clinic/phone'
import { encrypt } from '@/lib/crypto'
import { csvRecords, decodeCsvBytes } from '@/lib/import/csv'
import {
  BOOKING_COLUMNS, CLIENT_COLUMNS, SKIP_STAFF, type ZappyMap, bookingKey, detectDateOrder, nameKey as nameKeyOf, guessProviderId, guessType, isPersonalTime, isWaitingList,
  mapClientRow, mapService, mapStaff, mapStatus, norm, parseDate, parseDuration, parseTime, phoneE164, pick, resolveColumns, splitName, titleCase,
} from '@/lib/import/zappy'
import { createAppointment, setAppointmentStatus } from '@/lib/appointments/booking'
import { replanUpcoming } from '@/lib/appointments/replan'

export type ReportRow = { file: string; row: number; action: string; entity: string; externalId: string; name: string; detail: string }

export type ImportInput = {
  clients?: Uint8Array | null
  /** One or more appointment exports (Zappy allows 3 months per export). */
  bookings?: Uint8Array | Uint8Array[] | null
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
  bookings: { rows: number; files: number; columns: Record<string, string>; unused: string[] } | null
  counts: Record<string, number>
  report: ReportRow[]
  bookingStatuses: Record<string, number>
  /** `guess` = the type used until the mapping says otherwise. */
  unknownServices: { name: string; count: number; guess: string | null }[]
  /** `guess` = the dentist whose name matches, used until the mapping says otherwise. */
  unknownStaff: { name: string; count: number; guess: string | null }[]
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
    if (id !== SKIP_STAFF && !providerIds.includes(id)) throw new ImportError(`Mapping: staff "${name}" → unknown dentist id "${id}" (Settings → Practice → Dentists)`)
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
      smsRemindersEnabled: true, emailRemindersEnabled: true, consents: true, patientSince: true,
    },
  })
  type P = (typeof existing)[number]
  const byExternal = new Map<string, P>()
  /** Records imported before keyless clients got a stable id: name + Zappy creation time. */
  const byNameSince = new Map<string, P>()
  const nameSinceKey = (name: string, since: Date | null) => (since ? `${norm(name)}|${since.toISOString()}` : null)
  const byNif = new Map<string, P>()
  const byPhone = new Map<string, P[]>()
  /** Normalised full name → records (bookings without a client nº are matched by name). */
  const byName = new Map<string, P[]>()
  const index = (p: P) => {
    const nk = norm(`${p.firstName} ${p.lastName}`)
    if (nk) {
      const list = byName.get(nk) ?? []
      if (!list.some((x) => x.id === p.id)) byName.set(nk, [...list, p])
    }
    if (p.externalId) byExternal.set(p.externalId, p)
    else {
      const k = nameSinceKey(`${p.firstName} ${p.lastName}`, p.patientSince)
      if (k) byNameSince.set(k, p)
    }
    if (p.nif) byNif.set(p.nif.replace(/\D/g, ''), p)
    for (const ph of [p.phone, p.phone2]) {
      const k = phoneKey(ph)
      if (k) byPhone.set(k, [...(byPhone.get(k) ?? []), p])
    }
  }
  existing.forEach(index)
  // Records merged into another patient: their old identities lead to the patient they joined.
  const byId = new Map(existing.map((p) => [p.id, p]))
  for (const a of await prisma.patientAlias.findMany({ select: { externalId: true, patientId: true } })) {
    const p = byId.get(a.patientId)
    if (p && !byExternal.has(a.externalId)) byExternal.set(a.externalId, p)
  }
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

      // Match: Zappy id → name + Zappy creation time (records without a key yet) → NIF → phone + name
      let match: P | undefined = externalId ? byExternal.get(externalId) : undefined
      let how = 'zappy id'
      if (!match) {
        const k = nameSinceKey(display, patientSince)
        if (k) { match = byNameSince.get(k); how = 'name + Zappy creation date' }
      }
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
        // Matched by name + creation time = a record an earlier import created from this same
        // Zappy client (before it had a key): same record, its notes/follow-ups already exist.
        const sameZappyRecord = how === 'name + Zappy creation date'
        const fromZappy = (match.externalId === externalId && !!externalId) || sameZappyRecord
        firstLink = !match.externalId && !sameZappyRecord
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
          const k = nameSinceKey(`${match.firstName} ${match.lastName}`, match.patientSince)
          if (k) byNameSince.delete(k)
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
        index({ id: patientId, ...fields, externalId, lastVisitAt, patientSince } as unknown as P)
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
  const bookingFiles = Array.isArray(input.bookings) ? input.bookings : input.bookings ? [input.bookings] : []
  if (bookingFiles.length) {
    type Cols = ReturnType<typeof resolveColumns<typeof BOOKING_COLUMNS>>
    const rows: { file: string; rowNo: number; rec: Record<string, string>; cols: Cols; order: ReturnType<typeof detectDateOrder>; fileIndex: number }[] = []
    const unusedAll = new Set<string>()
    let firstCols: Cols | null = null
    for (const [fi, bytes] of bookingFiles.entries()) {
      const { headers, records } = csvRecords(decodeCsvBytes(bytes))
      const cols = resolveColumns(headers, BOOKING_COLUMNS)
      const label = bookingFiles.length > 1 ? `appointments file ${fi + 1}` : 'Bookings file'
      if (!cols.date) throw new ImportError(`${label}: no date column found. Is this the Zappy appointment list (reports → MARKINGS → export)?`)
      firstCols ??= cols
      headers.filter((h) => h && !Object.values(cols).includes(h)).forEach((h) => unusedAll.add(h))
      const order = detectDateOrder(records.map((r) => pick(r, cols, 'date')))
      records.forEach((rec, i) => rows.push({ file: bookingFiles.length > 1 ? `bookings${fi + 1}` : 'bookings', rowNo: i + 2, rec, cols, order, fileIndex: fi }))
    }
    result.bookings = { rows: rows.length, files: bookingFiles.length, columns: (firstCols ?? {}) as Record<string, string>, unused: [...unusedAll] }
    /** Dates each file covers: "missing from Zappy" is only judged inside them. */
    const ranges = bookingFiles.map(() => ({ min: '9999-12-31', max: '0000-01-01' }))
    const activeProviders = settings.providers.filter((p) => p.active)
    const existingWaitNotes = new Set(
      (await prisma.waitlistEntry.findMany({ where: { notes: { startsWith: 'Lista de espera no Zappy' } }, select: { patientId: true, notes: true } })).map((w) => `${w.patientId}|${w.notes}`),
    )

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
    const serviceGuess = new Map<string, string | null>()
    const staffGuess = new Map<string, string | null>()

    // Zappy lists a slot twice when a patient cancels and rebooks it (and overlapping exports repeat
    // rows): per client + date/time + service keep one row, preferring the one that is not cancelled.
    const slotKey = (r: (typeof rows)[number]) =>
      `${pick(r.rec, r.cols, 'clientId') || norm(pick(r.rec, r.cols, 'clientName'))}|${pick(r.rec, r.cols, 'date')}|${pick(r.rec, r.cols, 'start')}|${norm(pick(r.rec, r.cols, 'service'))}`
    const isCancelledRow = (r: (typeof rows)[number]) => /cancel|desmarc|anulad|eliminad/.test(norm(pick(r.rec, r.cols, 'status')))
    const keep = new Map<string, number>()
    rows.forEach((r, i) => {
      const k = slotKey(r)
      const cur = keep.get(k)
      if (cur === undefined || (isCancelledRow(rows[cur]) && !isCancelledRow(r))) keep.set(k, i)
    })

    for (const [ri, row] of rows.entries()) {
      const { file, rowNo, rec, cols, order, fileIndex } = row
      if (outOfTime()) {
        result.complete = false
        return finish()
      }
      const clientName = titleCase(pick(rec, cols, 'clientName'))
      const base = { file, row: rowNo, entity: 'appointment', externalId: '', name: clientName }
      const statusRaw = pick(rec, cols, 'status')
      const d = parseDate(pick(rec, cols, 'date'), order)
      const start = parseTime(pick(rec, cols, 'start')) ?? d?.time ?? null
      if (!d || !start) {
        bump('bookings.rejected')
        note({ ...base, action: 'reject', detail: `date/time not recognised: "${pick(rec, cols, 'date')}" "${pick(rec, cols, 'start')}"` })
        continue
      }
      if (d.date < ranges[fileIndex].min) ranges[fileIndex].min = d.date
      if (d.date > ranges[fileIndex].max) ranges[fileIndex].max = d.date
      if (isPersonalTime(statusRaw)) {
        bump('bookings.personalTime')
        note({ ...base, action: 'skip', detail: 'personal time in Zappy — use Block time in the agenda' })
        continue
      }
      if (keep.get(slotKey(row)) !== ri) {
        bump('bookings.duplicateRow')
        note({ ...base, action: 'skip', detail: 'same slot listed again (rebooked after cancelling, or in two exports) — the live booking is kept' })
        continue
      }
      const service = pick(rec, cols, 'service')
      const svc = mapService(service, map)
      if (service && !svc.known) {
        unknownServices.set(service, (unknownServices.get(service) ?? 0) + 1)
        if (!serviceGuess.has(service)) serviceGuess.set(service, guessType(service, pick(rec, cols, 'category')))
        const g = serviceGuess.get(service)
        if (g) svc.type = g as typeof svc.type
      }
      const staffName = pick(rec, cols, 'staff')
      const st = mapStaff(staffName, map)
      if (staffName && !st.known) {
        unknownStaff.set(staffName, (unknownStaff.get(staffName) ?? 0) + 1)
        if (!staffGuess.has(staffName)) staffGuess.set(staffName, guessProviderId(staffName, activeProviders))
        st.providerId = staffGuess.get(staffName) ?? st.providerId
      }
      if (st.providerId === SKIP_STAFF) {
        bump('bookings.skippedStaff')
        note({ ...base, action: 'skip', detail: `"${staffName}" is set to "Don't import"` })
        continue
      }
      const endRaw = parseTime(pick(rec, cols, 'end'))
      const typeCfg = settings.appointmentTypes.find((t) => t.type === svc.type)
      let duration = parseDuration(pick(rec, cols, 'duration')) ?? 0
      if (endRaw) {
        const [sh, sm] = start.split(':').map(Number)
        const [eh, em] = endRaw.split(':').map(Number)
        duration = eh * 60 + em - (sh * 60 + sm)
      }
      if (!duration || duration <= 0 || duration > 720) duration = typeCfg?.durationMinutes ?? 30

      // Patient: Zappy client id → phone + name → the record an earlier round made for this name →
      // unique name → create a minimal record. A record made here always gets a key (zappy:<nr>, or
      // zappy:n:<name hash> without a Nº), so later rounds and re-uploads find it instead of making
      // another one — even when the name is shared by several patients.
      const zcid = pick(rec, cols, 'clientId')
      const rawPhone = pick(rec, cols, 'phone')
      const phone = rawPhone ? phoneE164(rawPhone) : null
      const nm = splitName(clientName)
      const nameKey = clientName ? nameKeyOf(clientName) : null
      let patient: P | undefined = zcid ? byExternal.get(`zappy:${zcid}`) : undefined
      if (!patient && phone) patient = (byPhone.get(phoneKey(phone)!) ?? []).find((p) => sameName(p, nm))
      if (!patient && !zcid && nameKey) patient = byExternal.get(nameKey)
      let ambiguous = 0
      if (!patient && clientName) {
        // Only an unambiguous name: two patients called the same are never guessed between.
        const same = byName.get(norm(clientName)) ?? []
        if (same.length === 1) patient = same[0]
        else ambiguous = same.length
      }
      if (!patient) {
        if (!clientName) {
          bump('bookings.rejected')
          note({ ...base, action: 'reject', detail: 'no client id, phone or name' })
          continue
        }
        bump('clients.createdFromBooking')
        if (ambiguous) bump('clients.ambiguousName')
        const data = { firstName: titleCase(nm.firstName), lastName: titleCase(nm.lastName), phone, externalId: zcid ? `zappy:${zcid}` : nameKey }
        note({
          file, row: rowNo, entity: 'patient', externalId: data.externalId ?? '', name: clientName, action: 'create',
          detail: ambiguous ? `${ambiguous} patients are called "${clientName}" and the booking has no client Nº — booked under one new record; merge it with the right patient` : 'client only found in the bookings file',
        })
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
        : bookingKey(patient.externalId ?? patient.id, d.date, start, service)
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

      // Waiting list: goes on the CRM waiting list (future dates only), not into the agenda.
      if (isWaitingList(statusRaw)) {
        bump('bookings.waitlist')
        const wlNote = `Lista de espera no Zappy (${d.date}${service ? ` · ${service}` : ''})`
        const fresh = d.date >= today && !existingWaitNotes.has(`${patient.id}|${wlNote}`)
        note({ ...base, action: fresh ? 'waitlist' : 'skip', detail: fresh ? `added to the waiting list: ${wlNote}` : 'waiting list entry in the past or already imported' })
        if (fresh && COMMIT && !patient.id.startsWith('planned-')) {
          const active = await prisma.waitlistEntry.findFirst({ where: { patientId: patient.id, status: 'ACTIVE' }, select: { id: true } })
          if (!active) {
            await prisma.waitlistEntry.create({
              data: { patientId: patient.id, type: svc.type, providerId: st.providerId, fromDate: today, untilDate: d.date, notes: wlNote, createdById: author.id },
            })
          }
          existingWaitNotes.add(`${patient.id}|${wlNote}`)
        }
        continue
      }

      const mapped = mapStatus(statusRaw, isPast)
      // Paid in Zappy = it happened.
      if (mapped.inferred && pick(rec, cols, 'paymentDate')) Object.assign(mapped, { status: 'COMPLETED', inferred: false })
      statusCounts.set(mapped.status, (statusCounts.get(mapped.status) ?? 0) + 1)
      if (!isPast && (mapped.status === 'SCHEDULED' || mapped.status === 'CONFIRMED')) futurePerDay.set(d.date, (futurePerDay.get(d.date) ?? 0) + 1)
      const online = /online|app|website|site|@|instagram|facebook|^(sim|yes|true|1)$/i.test(pick(rec, cols, 'channel'))
      const cancelReason = pick(rec, cols, 'cancelReason')
      const notes = [pick(rec, cols, 'notes'), pick(rec, cols, 'notes2'), cancelReason && mapped.status === 'CANCELLED' ? null : cancelReason, mapped.note, mapped.inferred ? '[Estado inferido na importação]' : null]
        .filter(Boolean).join(' · ') || null

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
                ...(diff.includes('status') && { status: mapped.status as AppointmentStatus, ...(mapped.status === 'CANCELLED' && { cancelledAt: now, cancelReason: cancelReason || 'Cancelada no Zappy' }) }),
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
          await prisma.appointment.update({ where: { id: r.appointment.id }, data: { cancelledAt: r.appointment.startTime, cancelReason: cancelReason || mapped.note || 'Cancelada no Zappy' } })
        }
      }
    }

    // Bookings deleted in Zappy since the last import (future only, inside the exported range)
    const missing = existingAppts.filter((a) => {
      const day = utcToZoned(a.startTime, tz).date
      return !seen.has(a.externalId!) && day >= today && ranges.some((r) => day >= r.min && day <= r.max) && (a.status === 'SCHEDULED' || a.status === 'CONFIRMED')
    })
    result.missingFromExport = missing.length
    for (const a of missing) {
      note({ file: 'bookings', row: 0, entity: 'appointment', externalId: a.externalId!, name: '', action: input.cancelMissing ? 'cancel' : 'missing', detail: utcToZoned(a.startTime, tz).date })
      if (COMMIT && input.cancelMissing) {
        await setAppointmentStatus(a.id, { status: 'CANCELLED', reason: 'Removida no Zappy', notifyPatient: false }, { kind: 'IMPORT' }, { settings })
      }
    }

    result.bookingStatuses = Object.fromEntries(statusCounts)
    result.unknownServices = [...unknownServices].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count, guess: serviceGuess.get(name) ?? null }))
    result.unknownStaff = [...unknownStaff].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count, guess: staffGuess.get(name) ?? null }))
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
