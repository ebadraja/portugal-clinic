/**
 * Import clients and bookings exported from Zappy.
 *
 *   npx tsx scripts/import-zappy.ts --clients clientes.csv --bookings marcacoes.csv --map scripts/zappy-map.json
 *       → DRY RUN: reads everything, writes nothing, prints a summary and writes zappy-import-report.csv
 *   … --commit                 → writes (idempotent: re-run at cutover to pick up changes)
 *   … --cancel-missing         → with --commit: cancel imported FUTURE bookings no longer in the export
 *   … --report path.csv        → where to write the row-by-row report
 *
 * Export from Zappy as Excel, then "Save As → CSV UTF-8" (";" or "," both work). Column names
 * are recognised in Portuguese or English (lib/import/zappy.ts). The mapping file translates
 * Zappy services → CRM appointment types and Zappy staff → CRM dentist ids.
 *
 * Imported bookings never message patients. Reminders for upcoming ones are planned when
 * reminders are switched on (Settings → Agenda & Reminders), or right away if they already are.
 */
import 'dotenv/config'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { prisma } from '../lib/prisma'
import type { AppointmentStatus, AppointmentType, Prisma } from '../lib/generated/prisma/client'
import { APPOINTMENT_TYPE_KEYS, getClinicSettings } from '../lib/clinic/settings'
import { todayInZone, utcToZoned, zonedTimeToUtc } from '../lib/clinic/time'
import { phoneKey } from '../lib/clinic/phone'
import { encrypt } from '../lib/crypto'
import { csvRecords, decodeCsvBytes } from '../lib/import/csv'
import {
  BOOKING_COLUMNS, CLIENT_COLUMNS, type ZappyMap, isValidNif, mapService, mapStaff, mapStatus, norm, parseDate,
  parseDuration, parseGender, parseTime, phoneE164, pick, refusesMarketing, resolveColumns, splitName, titleCase,
} from '../lib/import/zappy'
import { createAppointment, setAppointmentStatus } from '../lib/appointments/booking'
import { replanUpcoming } from '../lib/appointments/replan'

// ─── Args ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const arg = (name: string) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const flag = (name: string) => argv.includes(`--${name}`)
const COMMIT = flag('commit')
const CANCEL_MISSING = flag('cancel-missing')
const REPORT = arg('report') ?? 'zappy-import-report.csv'
const clientsFile = arg('clients')
const bookingsFile = arg('bookings')
const mapFile = arg('map') ?? 'scripts/zappy-map.json'

if (!clientsFile && !bookingsFile) {
  console.error('Give --clients <file.csv> and/or --bookings <file.csv> (see the header of this script).')
  process.exit(1)
}

// ─── Report ──────────────────────────────────────────────────────────────────

type Row = { file: string; row: number; action: string; entity: string; externalId: string; name: string; detail: string }
const report: Row[] = []
const note = (r: Row) => report.push(r)
const counts = new Map<string, number>()
const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1)

function csvEscape(v: string): string {
  return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

// ─── Load ────────────────────────────────────────────────────────────────────

function load(file: string) {
  const { headers, records } = csvRecords(decodeCsvBytes(readFileSync(file)))
  return { headers, records }
}

function loadMap(): ZappyMap {
  let raw: Partial<ZappyMap> = {}
  try {
    raw = JSON.parse(readFileSync(mapFile, 'utf-8'))
  } catch {
    console.warn(`! No mapping file at ${mapFile} — every service becomes OTHER and no dentist is set. Copy scripts/zappy-map.example.json.`)
  }
  const map: ZappyMap = {
    services: raw.services ?? {},
    staff: raw.staff ?? {},
    defaultType: (raw.defaultType ?? 'OTHER') as AppointmentType,
    defaultProviderId: raw.defaultProviderId ?? null,
  }
  for (const [name, type] of Object.entries(map.services)) {
    if (!(APPOINTMENT_TYPE_KEYS as readonly string[]).includes(type)) throw new Error(`Mapping: service "${name}" → unknown type ${type}`)
  }
  return map
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const dbHost = (() => {
    try { return new URL(process.env.DATABASE_URL ?? '').host } catch { return '(unknown)' }
  })()
  console.log(`${COMMIT ? 'IMPORT (writing)' : 'DRY RUN (nothing is written)'} → database ${dbHost}`)

  const settings = await getClinicSettings()
  const tz = settings.timezone
  const map = loadMap()
  for (const [name, id] of Object.entries(map.staff)) {
    if (!settings.providers.some((p) => p.id === id)) throw new Error(`Mapping: staff "${name}" → unknown dentist id "${id}" (Settings → Practice → Dentists)`)
  }
  if (map.defaultProviderId && !settings.providers.some((p) => p.id === map.defaultProviderId)) throw new Error(`Mapping: defaultProviderId "${map.defaultProviderId}" is not a dentist id`)

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  if (!admin) throw new Error('No active admin user — notes need an author.')

  // Existing patients, indexed for matching.
  const existing = await prisma.patient.findMany({
    select: { id: true, firstName: true, lastName: true, phone: true, email: true, nif: true, externalId: true, dateOfBirth: true, address: true, city: true, zipCode: true, gender: true, clientSource: true },
  })
  type P = (typeof existing)[number]
  const byExternal = new Map<string, P>()
  const byNif = new Map<string, P>()
  const byPhone = new Map<string, P[]>()
  const index = (p: P) => {
    if (p.externalId) byExternal.set(p.externalId, p)
    if (p.nif) byNif.set(p.nif.replace(/\D/g, ''), p)
    const k = phoneKey(p.phone)
    if (k) byPhone.set(k, [...(byPhone.get(k) ?? []), p])
  }
  existing.forEach(index)
  const sameName = (a: { firstName: string; lastName: string }, b: { firstName: string; lastName: string }) =>
    norm(a.firstName).split(' ')[0] === norm(b.firstName).split(' ')[0] && norm(a.lastName).split(' ').at(-1) === norm(b.lastName).split(' ').at(-1)

  const touchedPatients = new Set<string>()
  let tempSeq = 0

  // ── Clients ──
  if (clientsFile) {
    const { headers, records } = load(clientsFile)
    const cols = resolveColumns(headers, CLIENT_COLUMNS)
    console.log(`\nClients: ${records.length} rows · columns → ${Object.entries(cols).map(([k, h]) => `${k}="${h}"`).join(', ')}`)
    const unused = headers.filter((h) => !Object.values(cols).includes(h))
    if (unused.length) console.log(`  not imported: ${unused.join(', ')}`)
    if (!cols.name && !cols.firstName) throw new Error('Clients file: no name column found.')

    for (const [i, rec] of records.entries()) {
      const rowNo = i + 2
      const zid = pick(rec, cols, 'id')
      const externalId = zid ? `zappy:${zid}` : null
      const fullName = pick(rec, cols, 'name')
      const split = cols.firstName ? { firstName: pick(rec, cols, 'firstName'), lastName: pick(rec, cols, 'lastName') } : splitName(fullName)
      const firstName = titleCase(split.firstName)
      const lastName = titleCase(split.lastName)
      const display = `${firstName} ${lastName}`.trim()
      const base = { file: 'clients', row: rowNo, entity: 'patient', externalId: externalId ?? '', name: display }
      if (!firstName) {
        bump('clients.rejected')
        note({ ...base, action: 'reject', detail: 'no name' })
        continue
      }
      const warnings: string[] = []
      const rawPhone = pick(rec, cols, 'phone') || pick(rec, cols, 'phone2')
      const phone = rawPhone ? phoneE164(rawPhone) : null
      if (rawPhone && !phone) warnings.push(`phone not recognised: ${rawPhone}`)
      if (!lastName) warnings.push('no surname')
      const rawNif = pick(rec, cols, 'nif').replace(/\D/g, '')
      const nif = rawNif && isValidNif(rawNif) ? rawNif : null
      if (rawNif && !nif) warnings.push(`invalid NIF ${rawNif}`)
      const dobParsed = parseDate(pick(rec, cols, 'dob'))
      const dob = dobParsed && dobParsed.date >= '1900-01-01' && dobParsed.date <= todayInZone(tz) ? new Date(`${dobParsed.date}T00:00:00Z`) : null
      if (pick(rec, cols, 'dob') && !dob) warnings.push(`date of birth not recognised: ${pick(rec, cols, 'dob')}`)
      const email = pick(rec, cols, 'email').toLowerCase() || null
      const data = {
        firstName,
        lastName,
        phone,
        email: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null,
        nif,
        dateOfBirth: dob,
        address: pick(rec, cols, 'address') || null,
        zipCode: pick(rec, cols, 'postalCode') || null,
        city: pick(rec, cols, 'city') || null,
        gender: parseGender(pick(rec, cols, 'gender')),
        clientSource: pick(rec, cols, 'origin') || null,
      }
      const notes = pick(rec, cols, 'notes')
      const noMarketing = cols.marketingConsent ? refusesMarketing(pick(rec, cols, 'marketingConsent')) : false

      // Match: Zappy id → NIF → phone + name
      let match: P | undefined = externalId ? byExternal.get(externalId) : undefined
      let how = 'zappy id'
      if (!match && nif) { match = byNif.get(nif); how = 'NIF' }
      if (!match && phone) { match = (byPhone.get(phoneKey(phone)!) ?? []).find((p) => sameName(p, data)); how = 'phone + name' }

      if (match && externalId && match.externalId && match.externalId !== externalId) {
        // Two Zappy records for one person (Zappy duplicates): keep the first, report.
        bump('clients.duplicate')
        note({ ...base, action: 'duplicate', detail: `same person as ${match.externalId} (${how}) — merge in Zappy or ignore` })
        continue
      }

      if (match) {
        // Zappy is the source of truth for records it created; CRM-made records only get gaps filled.
        const fromZappy = match.externalId === externalId && !!externalId
        const patch: Prisma.PatientUpdateInput = {}
        const same = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : String(a ?? '') === String(b ?? ''))
        for (const [k, v] of Object.entries(data) as [keyof typeof data, unknown][]) {
          if (v === null || v === '') continue
          const cur = (match as Record<string, unknown>)[k]
          const take = fromZappy ? !same(cur, v) : cur === null || cur === ''
          if (take) (patch as Record<string, unknown>)[k] = v
        }
        if (!match.externalId && externalId) patch.externalId = externalId
        const changed = Object.keys(patch)
        bump(changed.length ? (fromZappy ? 'clients.updated' : 'clients.merged') : 'clients.unchanged')
        note({ ...base, action: changed.length ? (fromZappy ? 'update' : 'merge') : 'unchanged', detail: [changed.length ? `fields: ${changed.join(', ')}` : '', `matched by ${how}`, ...warnings].filter(Boolean).join('; ') })
        if (COMMIT && changed.length) {
          await prisma.patient.update({ where: { id: match.id }, data: patch })
          touchedPatients.add(match.id)
        }
        if (!match.externalId && externalId) {
          match.externalId = externalId
          byExternal.set(externalId, match)
        }
        continue
      }

      bump('clients.created')
      note({ ...base, action: 'create', detail: warnings.join('; ') })
      let id = `planned-${++tempSeq}`
      if (COMMIT) {
        const created = await prisma.patient.create({ data: { ...data, externalId, status: 'ACTIVE', createdById: admin.id } })
        id = created.id
        touchedPatients.add(id)
        if (notes) {
          await prisma.patientNote.create({ data: { patientId: id, authorId: admin.id, content: `Importado do Zappy: ${notes}`, noteType: 'ADMINISTRATIVE' } })
        }
        if (noMarketing && data.email) {
          await prisma.unsubscribe.upsert({ where: { patientId: id }, create: { patientId: id, email: encrypt(data.email), reason: 'Zappy: sem consentimento de marketing' }, update: {} })
        }
      }
      const planned = { id, ...data, externalId } as P
      index(planned)
    }
  }

  // ── Bookings ──
  if (bookingsFile) {
    const { headers, records } = load(bookingsFile)
    const cols = resolveColumns(headers, BOOKING_COLUMNS)
    console.log(`\nBookings: ${records.length} rows · columns → ${Object.entries(cols).map(([k, h]) => `${k}="${h}"`).join(', ')}`)
    const unused = headers.filter((h) => !Object.values(cols).includes(h))
    if (unused.length) console.log(`  not imported: ${unused.join(', ')}`)
    if (!cols.date) throw new Error('Bookings file: no date column found.')

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
          const created = await prisma.patient.create({ data: { ...data, status: 'ACTIVE', createdById: admin.id } })
          id = created.id
        }
        patient = { id, ...data, email: null, nif: null, dateOfBirth: null, address: null, city: null, zipCode: null, gender: null, clientSource: null } as P
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
          touchedPatients.add(patient.id)
        }
        continue
      }

      bump('bookings.created')
      note({ ...base, action: 'create', detail: [`${d.date} ${start} ${duration}min ${svc.type} ${mapped.status}`, !svc.known && service ? `unknown service "${service}"` : '', !st.known && staffName ? `unknown staff "${staffName}"` : ''].filter(Boolean).join('; ') })
      if (COMMIT) {
        const r = await createAppointment(
          {
            patientId: patient.id,
            date: d.date,
            time: start,
            type: svc.type,
            durationMinutes: duration,
            providerId: st.providerId,
            reason: service || null,
            notes,
            status: mapped.status,
            bookedVia: online ? 'WEBSITE' : 'IMPORT',
            externalId,
            notifyPatient: false,
          },
          { kind: 'IMPORT' },
          { settings: { ...settings, flags: { ...settings.flags, reminders: false } }, now },
        )
        if (!r.ok) {
          bump('bookings.failed')
          note({ ...base, action: 'error', detail: r.message })
        } else {
          touchedPatients.add(patient.id)
          if (mapped.status === 'CANCELLED') {
            await prisma.appointment.update({ where: { id: r.appointment.id }, data: { cancelledAt: r.appointment.startTime, cancelReason: mapped.note ?? 'Cancelada no Zappy' } })
          }
        }
      }
    }

    // Bookings deleted in Zappy since the last import (future only, inside the exported range)
    const today = todayInZone(tz)
    const missing = existingAppts.filter((a) => {
      const day = utcToZoned(a.startTime, tz).date
      return !seen.has(a.externalId!) && day >= today && day >= minDate && day <= maxDate && (a.status === 'SCHEDULED' || a.status === 'CONFIRMED')
    })
    if (missing.length) {
      console.log(`\n${missing.length} upcoming imported booking(s) are no longer in the export${CANCEL_MISSING ? ' — cancelling' : ' (use --cancel-missing to cancel them)'}.`)
      for (const a of missing) {
        note({ file: 'bookings', row: 0, entity: 'appointment', externalId: a.externalId!, name: '', action: CANCEL_MISSING ? 'cancel' : 'missing', detail: utcToZoned(a.startTime, tz).date })
        if (COMMIT && CANCEL_MISSING) {
          await setAppointmentStatus(a.id, { status: 'CANCELLED', reason: 'Removida no Zappy', notifyPatient: false }, { kind: 'IMPORT' }, { settings })
        }
      }
    }

    console.log('\nBookings by status:', Object.fromEntries(statusCounts))
    if (unknownServices.size) {
      console.log(`\nServices not in the mapping file (imported as ${map.defaultType}) — add them to ${mapFile}:`)
      for (const [s, n] of [...unknownServices].sort((a, b) => b[1] - a[1])) console.log(`  ${n.toString().padStart(5)}  ${s}`)
    }
    if (unknownStaff.size) {
      console.log(`\nStaff not in the mapping file (imported with ${map.defaultProviderId ?? 'no dentist'}):`)
      for (const [s, n] of [...unknownStaff].sort((a, b) => b[1] - a[1])) console.log(`  ${n.toString().padStart(5)}  ${s}`)
    }
    const days = [...futurePerDay].sort((a, b) => a[0].localeCompare(b[0]))
    if (days.length) {
      console.log('\nUpcoming appointments per day (compare with the Zappy agenda):')
      for (const [day, n] of days.slice(0, 31)) console.log(`  ${day}  ${n}`)
      if (days.length > 31) console.log(`  … ${days.length - 31} more days (see the report)`)
      for (const [day, n] of days) note({ file: 'summary', row: 0, entity: 'day', externalId: '', name: day, action: 'upcoming', detail: String(n) })
    }
  }

  // ── After the import ──
  if (COMMIT && touchedPatients.size) {
    for (const id of touchedPatients) {
      const agg = await prisma.appointment.aggregate({ where: { patientId: id, status: 'COMPLETED' }, _count: { _all: true }, _max: { startTime: true } })
      await prisma.patient.update({ where: { id }, data: { totalVisits: agg._count._all, lastVisitAt: agg._max.startTime } })
    }
    await prisma.auditLog.create({
      data: { userId: admin.id, action: 'CREATE', entity: 'import', entityId: 'zappy', changes: JSON.parse(JSON.stringify({ counts: Object.fromEntries(counts), clientsFile, bookingsFile })), userAgent: 'import-zappy', timestamp: new Date() },
    })
    if (settings.flags.reminders) {
      const r = await replanUpcoming(settings)
      console.log(`\nReminders are on: planned ${r.messages} message(s) for ${r.appointments} upcoming appointment(s).`)
    }
  }

  writeFileSync(REPORT, ['file;row;action;entity;externalId;name;detail', ...report.map((r) => [r.file, r.row, r.action, r.entity, r.externalId, r.name, r.detail].map((v) => csvEscape(String(v))).join(';'))].join('\n'), 'utf-8')
  console.log('\nSummary:', Object.fromEntries([...counts].sort()))
  console.log(`Report: ${REPORT}${COMMIT ? '' : '  (dry run — run again with --commit to write)'}`)
}

main()
  .catch((err) => {
    console.error('\nImport stopped:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
