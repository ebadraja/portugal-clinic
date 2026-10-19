/**
 * Zappy → CRM mapping. Pure: no database access (the script in scripts/import-zappy.ts does I/O).
 *
 * Zappy exports clients as CSV/Excel and bookings via the "Listagem de marcações" report
 * (or the Public API). Column names vary between versions/languages, so every field is
 * found through a list of aliases (accent- and case-insensitive). The mapping file
 * (scripts/zappy-map.json) translates Zappy services and staff into CRM types and dentists.
 */
import { createHash } from 'node:crypto'
import type { AppointmentStatus, AppointmentType } from '@/lib/generated/prisma/client'
import { toE164 } from '@/lib/clinic/phone'

export const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// ─── Columns ─────────────────────────────────────────────────────────────────

// First alias = Zappy's own export header (backoffice → customers → export); the rest cover
// other versions/languages and hand-made spreadsheets.
export const CLIENT_COLUMNS = {
  id: ['nr', 'n cliente', 'no cliente', 'numero cliente', 'num cliente', 'id cliente', 'codigo cliente', 'cliente id', 'id', 'codigo', 'numero', 'client id', 'client number'],
  name: ['name', 'nome', 'cliente'],
  fullName: ['full name', 'nome completo', 'nome para fatura', 'name for the invoice'],
  firstName: ['primeiro nome', 'nome proprio', 'first name'],
  lastName: ['apelido', 'apelidos', 'ultimo nome', 'last name', 'surname'],
  phone: ['mobile', 'telemovel', 'tlm', 'telefone', 'contacto', 'telefone 1', 'phone'],
  phoneNote: ['phone main note', 'nota telemovel', 'cell phone note'],
  phone2: ['phone 2', 'telefone 2', 'telefone fixo', 'outro telefone'],
  phone2Note: ['phone 2 note', 'nota telefone 2'],
  email: ['email', 'e mail', 'correio eletronico'],
  nif: ['vat number', 'nif', 'contribuinte', 'n contribuinte', 'no contribuinte', 'numero de contribuinte', 'vat', 'tax number', 'tax id cnpj'],
  dob: ['data de nascimento', 'data nascimento', 'nascimento', 'aniversario', 'date of birth', 'birthday', 'birth date'],
  birthDay: ['birth day', 'dia nascimento', 'dia de nascimento'],
  birthMonth: ['birth month', 'mes nascimento', 'mes de nascimento'],
  birthYear: ['birth year', 'ano nascimento', 'ano de nascimento'],
  address: ['address', 'morada', 'endereco'],
  postalCode: ['zipcode', 'zip code', 'codigo postal', 'cod postal', 'cp', 'postal code', 'zip'],
  city: ['city', 'localidade', 'cidade', 'location'],
  gender: ['gender', 'genero', 'sexo', 'sex'],
  segments: ['segment manual', 'segmentos', 'segments', 'outros segmentos'],
  segmentAuto: ['segment automatic', 'segmento automatico'],
  origin: ['crm source', 'origem', 'como nos conheceu', 'source', 'origin'],
  referral: ['crm referral', 'referencia', 'recomendado'],
  referralName: ['crm referral client name', 'recomendado por', 'referred by'],
  notes: ['obs 1', 'observacoes', 'notas', 'obs', 'notes', 'comentarios'],
  notes2: ['obs 2'],
  notes3: ['obs 3'],
  invoiceNotes: ['invoice obs', 'notes for the invoice', 'notas fatura'],
  crmWork: ['crm work'],
  crmNextStep: ['crm next step', 'proximo passo'],
  crmNextStepDate: ['crm next step date', 'data proximo passo'],
  loyaltyLabel: ['loyaltycard won label'],
  loyaltyValue: ['loyaltycard won value'],
  consentAppointments: ['data protection type appointments'],
  consentCampaigns: ['data protection type campaigns', 'consentimento marketing', 'aceita marketing', 'rgpd marketing', 'marketing', 'consentimento rgpd', 'aceita comunicacoes'],
  consentRecords: ['data protection type customer records'],
  consentRemindersEmail: ['data protection type reminders email'],
  consentRemindersSms: ['data protection type reminders sms'],
  consentPhotos: ['data protection type share photos'],
  consentPhotosNoFace: ['data protection type share photos no face'],
  consentSurvey: ['data protection type survey'],
  consentUpdatedOn: ['rgpd updated on'],
  createdOn: ['createdon', 'created on', 'data de criacao', 'cliente desde'],
  nextAppointment: ['next appointment date', 'proxima marcacao'],
  lastAppointment: ['last appointment date', 'ultima marcacao'],
} as const

export const BOOKING_COLUMNS = {
  id: ['n marcacao', 'no marcacao', 'id marcacao', 'codigo marcacao', 'marcacao', 'booking id', 'appointment id', 'id'],
  clientId: ['n cliente', 'no cliente', 'id cliente', 'codigo cliente', 'cliente id', 'client id'],
  clientName: ['cliente', 'nome cliente', 'nome', 'client', 'customer'],
  phone: ['telemovel', 'telefone', 'contacto', 'phone', 'mobile'],
  date: ['data', 'dia', 'data marcacao', 'date'],
  start: ['hora', 'hora inicio', 'inicio', 'hora de inicio', 'start', 'start time'],
  end: ['hora fim', 'fim', 'hora de fim', 'end', 'end time'],
  duration: ['duracao', 'duracao min', 'minutos', 'duration'],
  service: ['servico', 'servicos', 'tratamento', 'tratamentos', 'service', 'services'],
  staff: ['colaborador', 'profissional', 'funcionario', 'medico', 'terapeuta', 'staff', 'employee'],
  status: ['estado', 'status', 'situacao'],
  notes: ['observacoes', 'notas', 'obs', 'notes', 'comentario'],
  channel: ['canal', 'origem', 'tipo de marcacao', 'online', 'source'],
} as const

export type ColumnMap<T extends Record<string, readonly string[]>> = Partial<Record<keyof T, string>>

/** Which header in the file holds each field (first alias that matches). */
export function resolveColumns<T extends Record<string, readonly string[]>>(headers: string[], spec: T): ColumnMap<T> {
  const byNorm = new Map(headers.map((h) => [norm(h), h]))
  const used = new Set<string>()
  const out: ColumnMap<T> = {}
  for (const key of Object.keys(spec) as (keyof T)[]) {
    for (const alias of spec[key]) {
      const h = byNorm.get(alias)
      if (h && !used.has(h)) {
        out[key] = h
        used.add(h)
        break
      }
    }
  }
  return out
}

export function pick<T extends Record<string, readonly string[]>>(rec: Record<string, string>, cols: ColumnMap<T>, key: keyof T): string {
  const h = cols[key]
  return h ? (rec[h] ?? '').trim() : ''
}

// ─── Values ──────────────────────────────────────────────────────────────────

/** dd/mm/yyyy (Portuguese), yyyy-mm-dd, dd-mm-yyyy, dd.mm.yy, Excel serial; optional time after. */
export function parseDate(raw: string): { date: string; time: string | null } | null {
  const t = raw.trim()
  if (!t) return null
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    // Excel serial day (1900 system): 45000 ≈ 2023-03-15
    const serial = Number(t)
    const ms = Math.round((serial - 25569) * 86_400_000)
    const d = new Date(ms)
    if (isNaN(d.getTime())) return null
    const frac = serial % 1
    const mins = Math.round(frac * 1440)
    return { date: d.toISOString().slice(0, 10), time: frac ? `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}` : null }
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})[:h](\d{2}))?/.exec(t)
  let y: number, mo: number, d: number, hh: string | undefined, mm: string | undefined
  if (m) {
    ;[y, mo, d, hh, mm] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4], m[5]]
  } else {
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s+(\d{1,2})[:h](\d{2}))?/.exec(t)
    if (!m) return null
    ;[d, mo, y, hh, mm] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4], m[5]]
    if (y < 100) y += y > 50 ? 1900 : 2000
  }
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  const time = hh !== undefined ? parseTime(`${hh}:${mm}`) : null
  return { date: dt.toISOString().slice(0, 10), time }
}

/** "9:30", "09h30", "0930", "9.30" → "09:30". */
export function parseTime(raw: string): string | null {
  const m = /^(\d{1,2})\s*[:hH.]?\s*(\d{2})/.exec(raw.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** "45", "45 min", "1h", "1h30", "01:30" → minutes. */
export function parseDuration(raw: string): number | null {
  const t = norm(raw)
  if (!t) return null
  let m = /^(\d{1,2}) (\d{2})$/.exec(t) // "01 30" from "01:30"
  if (m) return Number(m[1]) * 60 + Number(m[2])
  m = /^(\d+)\s*h\s*(\d+)?/.exec(t)
  if (m) return Number(m[1]) * 60 + Number(m[2] ?? 0)
  m = /^(\d+)/.exec(t)
  return m ? Number(m[1]) : null
}

/** Portuguese NIF checksum (mod 11). */
export function isValidNif(raw: string): boolean {
  const d = raw.replace(/\D/g, '')
  if (!/^[1235689]\d{8}$/.test(d) && !/^(45|70|71|72|74|75|77|79|90|91|98|99)\d{7}$/.test(d)) return false
  const sum = d.slice(0, 8).split('').reduce((acc, c, i) => acc + Number(c) * (9 - i), 0)
  const check = 11 - (sum % 11)
  return (check >= 10 ? 0 : check) === Number(d[8])
}

/** Portuguese names: first word is the given name, the rest the surnames. */
export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().replace(/\s+/g, ' ').split(' ')
  if (parts.length <= 1) return { firstName: parts[0] ?? '', lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

export function titleCase(s: string): string {
  const lower = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])
  return s.toLowerCase().replace(/(^|\s|-)(\p{L})/gu, (m, sep: string, ch: string) => sep + ch.toUpperCase())
    .split(' ').map((w, i) => (i > 0 && lower.has(w.toLowerCase()) ? w.toLowerCase() : w)).join(' ')
}

export function parseGender(raw: string): 'MALE' | 'FEMALE' | 'OTHER' | null {
  const t = norm(raw)
  if (!t) return null
  if (['m', 'masculino', 'homem', 'male'].includes(t)) return 'MALE'
  if (['f', 'feminino', 'mulher', 'female'].includes(t)) return 'FEMALE'
  return 'OTHER'
}

/** Explicit "no" to marketing → unsubscribe from campaigns (appointment reminders are separate). */
export function refusesMarketing(raw: string): boolean {
  const t = norm(raw)
  return ['nao', 'n', 'no', 'false', '0', 'recusa', 'recusado', 'nao autoriza', 'nao aceita'].includes(t)
}

/**
 * Consent cells: "1"/"0", "Sim"/"Não", "true"/"false", "Autorizado"/"Não autorizado",
 * "yes"/"no". Empty or unknown → null (never assumed).
 */
export function parseConsent(raw: string): boolean | null {
  const t = norm(raw)
  if (!t) return null
  if (/^(nao|n|no|false|0|recusa|recusado|nao autoriza|nao autorizado|nao aceita|revogado|denied|rejected)$/.test(t) || t.startsWith('nao ')) return false
  if (/^(sim|s|yes|y|true|1|autoriza|autorizado|aceita|aceite|consentido|granted|accepted|ok)$/.test(t)) return true
  return null
}

const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  feb: 2, apr: 4, aug: 8, sep: 9, oct: 10, dec: 12,
}

/**
 * Zappy stores the birthday as three fields; the year is optional ("Again" in the form).
 * A full date only when all three make a real past date; otherwise day + month for the
 * birthday alert.
 */
export function parseBirth(dayRaw: string, monthRaw: string, yearRaw: string, today: string): { date: string | null; day: number | null; month: number | null } {
  const day = Number(dayRaw.trim()) || null
  const m = norm(monthRaw)
  const month = Number(m) || MONTHS[m] || MONTHS[m.slice(0, 3)] || null
  const year = Number(yearRaw.trim()) || null
  if (!day || !month || day > 31 || month > 12) return { date: null, day: null, month: null }
  const probe = new Date(Date.UTC(year ?? 2000, month - 1, day))
  if (probe.getUTCMonth() !== month - 1) return { date: null, day: null, month: null }
  if (year && year >= 1900) {
    const iso = probe.toISOString().slice(0, 10)
    if (iso <= today) return { date: iso, day, month }
  }
  return { date: null, day, month }
}

/**
 * Zappy "segmentos" cell → one tag per segment. Separated by "|", ";" or new lines; a single
 * segment containing commas stays whole (clinical text often has commas).
 */
export function splitSegments(raw: string): string[] {
  return raw
    .split(/[|;\n]+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0)
    .map((s) => s.slice(0, 200))
}

// ─── One client row ──────────────────────────────────────────────────────────

export type Consents = {
  appointments: boolean | null
  campaigns: boolean | null
  customerRecords: boolean | null
  remindersEmail: boolean | null
  remindersSms: boolean | null
  sharePhotos: boolean | null
  sharePhotosNoFace: boolean | null
  survey: boolean | null
  updatedAt: string | null
}

export type MappedClient = {
  externalId: string | null
  patient: {
    firstName: string
    lastName: string
    phone: string | null
    phoneNote: string | null
    phone2: string | null
    phone2Note: string | null
    email: string | null
    nif: string | null
    dateOfBirth: Date | null
    birthDay: number | null
    birthMonth: number | null
    gender: 'MALE' | 'FEMALE' | 'OTHER' | null
    address: string | null
    zipCode: string | null
    city: string | null
    invoiceName: string | null
    invoiceNotes: string | null
    clientSource: string | null
    referredBy: string | null
    tags: string[]
    smsRemindersEnabled: boolean
    emailRemindersEnabled: boolean
    consents: Consents | null
    patientSince: Date | null
    lastVisitAt: Date | null
  }
  /** Free text for patient notes (obs_1..3, loyalty card, old CRM steps). */
  notes: string[]
  /** Zappy CRM "next step" still worth a callback (dated in the last 60 days or later). */
  followUp: { reason: string; dueAt: Date | null } | null
  refusesCampaigns: boolean
  /** From next_appointment_date — to check against imported bookings. */
  nextAppointment: { date: string; time: string | null } | null
  warnings: string[]
}

type ClientCols = ColumnMap<typeof CLIENT_COLUMNS>

/**
 * Stable id of a Zappy client. Zappy's "Nº" is optional (many clinics leave it blank), so
 * without it the key is the name + Zappy's creation time — which never changes for a record,
 * so uploading the same export again updates instead of duplicating.
 */
export function clientKey(nr: string, fullName: string, createdOn: string): string | null {
  if (nr.trim()) return `zappy:${nr.trim()}`
  if (!createdOn.trim() || !norm(fullName)) return null
  return `zappy:c:${createHash('sha1').update(`${norm(fullName)}|${createdOn.trim()}`).digest('hex').slice(0, 16)}`
}

function dateOnly(raw: string): Date | null {
  const d = parseDate(raw)
  return d ? new Date(`${d.date}T${d.time ?? '00:00'}:00Z`) : null
}

/** Maps one Zappy client row to CRM fields. Pure; `today` is the clinic date (YYYY-MM-DD). */
export function mapClientRow(rec: Record<string, string>, cols: ClientCols, today: string): MappedClient | { reject: string } {
  const get = (k: keyof typeof CLIENT_COLUMNS) => pick(rec, cols, k)
  const warnings: string[] = []

  // Name: Zappy "name" is what the clinic sees; "full_name" (invoice name) completes it when
  // "name" is only a first name.
  const shortName = get('name')
  const fullName = get('fullName')
  let source = shortName || fullName
  const shortTokens = norm(shortName).split(' ').filter(Boolean)
  const fullTokens = norm(fullName).split(' ').filter(Boolean)
  if (shortTokens.length <= 1 && fullTokens.length > 1 && (!shortTokens.length || fullTokens[0] === shortTokens[0])) source = fullName
  const split = cols.firstName ? { firstName: get('firstName'), lastName: get('lastName') } : splitName(source)
  const firstName = titleCase(split.firstName)
  const lastName = titleCase(split.lastName)
  if (!firstName) return { reject: 'no name' }
  if (!lastName) warnings.push('no surname')
  const invoiceName = fullName && norm(fullName) !== norm(`${firstName} ${lastName}`) ? fullName.trim() : null

  // Phones: mobile first; the second number fills in when there is no mobile.
  const rawMobile = get('phone')
  const rawPhone2 = get('phone2')
  const mobile = rawMobile ? phoneE164(rawMobile) : null
  const second = rawPhone2 ? phoneE164(rawPhone2) : null
  if (rawMobile && !mobile) warnings.push(`mobile not recognised: ${rawMobile}`)
  if (rawPhone2 && !second) warnings.push(`phone 2 not recognised: ${rawPhone2}`)
  const phone = mobile ?? second
  const phone2 = mobile ? second : null

  const rawNif = get('nif').replace(/\D/g, '')
  const nif = rawNif && isValidNif(rawNif) ? rawNif : null
  if (rawNif && !nif) warnings.push(`invalid NIF ${rawNif}`)

  // Birthday: three fields (Zappy) or one date column (other sources).
  let dateOfBirth: Date | null = null
  let birthDay: number | null = null
  let birthMonth: number | null = null
  if (cols.birthDay || cols.birthMonth) {
    const b = parseBirth(get('birthDay'), get('birthMonth'), get('birthYear'), today)
    if (b.date) dateOfBirth = new Date(`${b.date}T00:00:00Z`)
    birthDay = b.day
    birthMonth = b.month
    if ((get('birthDay') || get('birthMonth')) && !b.day) warnings.push(`birthday not recognised: ${get('birthDay')}/${get('birthMonth')}/${get('birthYear')}`)
  } else if (get('dob')) {
    const d = parseDate(get('dob'))
    if (d && d.date >= '1900-01-01' && d.date <= today) {
      dateOfBirth = new Date(`${d.date}T00:00:00Z`)
      birthDay = Number(d.date.slice(8, 10))
      birthMonth = Number(d.date.slice(5, 7))
    } else warnings.push(`date of birth not recognised: ${get('dob')}`)
  }

  const emailRaw = get('email').toLowerCase()
  const email = emailRaw && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw) ? emailRaw : null
  if (emailRaw && !email) warnings.push(`email not valid: ${emailRaw}`)

  // GDPR consents (only recorded when the export has them)
  const consentCols = ['consentAppointments', 'consentCampaigns', 'consentRecords', 'consentRemindersEmail', 'consentRemindersSms', 'consentPhotos', 'consentPhotosNoFace', 'consentSurvey'] as const
  const hasConsents = consentCols.some((k) => cols[k])
  const consents: Consents | null = hasConsents
    ? {
        appointments: parseConsent(get('consentAppointments')),
        campaigns: parseConsent(get('consentCampaigns')),
        customerRecords: parseConsent(get('consentRecords')),
        remindersEmail: parseConsent(get('consentRemindersEmail')),
        remindersSms: parseConsent(get('consentRemindersSms')),
        sharePhotos: parseConsent(get('consentPhotos')),
        sharePhotosNoFace: parseConsent(get('consentPhotosNoFace')),
        survey: parseConsent(get('consentSurvey')),
        updatedAt: dateOnly(get('consentUpdatedOn'))?.toISOString() ?? null,
      }
    : null
  // Reminders are only switched off on an explicit "no".
  const smsRemindersEnabled = consents?.remindersSms !== false
  const emailRemindersEnabled = consents?.remindersEmail !== false

  const referralName = get('referralName')
  const referral = get('referral')
  const referredBy = referralName || (referral && !/^(0|1|sim|nao|não|yes|no|true|false)$/i.test(referral) ? referral : '') || null

  // Notes and the old CRM task
  const notes = [get('notes'), get('notes2'), get('notes3')].filter(Boolean)
  const loyalty = [get('loyaltyLabel'), get('loyaltyValue')].filter(Boolean).join(': ')
  if (loyalty) notes.push(`Cartão de fidelização Zappy — ${loyalty}`)
  const step = get('crmNextStep')
  const work = get('crmWork')
  const stepDate = dateOnly(get('crmNextStepDate'))
  let followUp: MappedClient['followUp'] = null
  if (step || work) {
    const reason = [step && `Próximo passo (Zappy): ${step}`, work && `Trabalho CRM: ${work}`].filter(Boolean).join(' · ')
    const cutoff = new Date(`${today}T00:00:00Z`)
    cutoff.setUTCDate(cutoff.getUTCDate() - 60)
    if (step && (!stepDate || stepDate >= cutoff)) followUp = { reason, dueAt: stepDate }
    else notes.push(`${reason}${stepDate ? ` (${stepDate.toISOString().slice(0, 10)})` : ''}`)
  }

  const next = parseDate(get('nextAppointment'))
  return {
    externalId: clientKey(get('id'), `${firstName} ${lastName}`, get('createdOn')),
    patient: {
      firstName,
      lastName,
      phone,
      phoneNote: get('phoneNote') || null,
      phone2,
      phone2Note: get('phone2Note') || null,
      email,
      nif,
      dateOfBirth,
      birthDay,
      birthMonth,
      gender: parseGender(get('gender')),
      address: get('address') || null,
      zipCode: get('postalCode') || null,
      city: get('city') || null,
      invoiceName,
      invoiceNotes: get('invoiceNotes') || null,
      clientSource: get('origin') || null,
      referredBy,
      tags: splitSegments(get('segments')),
      smsRemindersEnabled,
      emailRemindersEnabled,
      consents,
      patientSince: dateOnly(get('createdOn')),
      lastVisitAt: dateOnly(get('lastAppointment')),
    },
    notes,
    followUp,
    refusesCampaigns: consents ? consents.campaigns === false : refusesMarketing(get('consentCampaigns')),
    nextAppointment: next && next.date >= today ? next : null,
    warnings,
  }
}

// ─── Booking status ──────────────────────────────────────────────────────────

export type MappedStatus = { status: AppointmentStatus; inferred: boolean; note: string | null }

/**
 * Zappy statuses → CRM. Past bookings still "booked/confirmed" become COMPLETED (flagged as
 * inferred); the waiting list has no slot in the CRM, so it is imported as cancelled with a note.
 */
export function mapStatus(raw: string, isPast: boolean): MappedStatus {
  const t = norm(raw)
  const has = (...words: string[]) => words.some((w) => t.includes(w))
  if (has('lista de espera', 'waiting')) return { status: 'CANCELLED', inferred: false, note: 'Lista de espera no Zappy' }
  if (has('faltou', 'falta', 'nao compareceu', 'no show', 'noshow', 'ausente')) return { status: 'NO_SHOW', inferred: false, note: null }
  if (has('cancel', 'desmarc', 'anulad', 'eliminad')) return { status: 'CANCELLED', inferred: false, note: null }
  if (has('conclu', 'realizad', 'finaliz', 'chegou', 'pagou', 'atendid', 'completed', 'done')) return { status: 'COMPLETED', inferred: false, note: null }
  const confirmed = has('confirmad', 'confirmed') && !has('aguarda', 'por confirmar', 'nao confirm')
  if (isPast) return { status: 'COMPLETED', inferred: true, note: null }
  return { status: confirmed ? 'CONFIRMED' : 'SCHEDULED', inferred: false, note: null }
}

// ─── Mapping file ────────────────────────────────────────────────────────────

export type ZappyMap = {
  /** Zappy service name → CRM appointment type. Matching ignores case and accents. */
  services: Record<string, AppointmentType>
  /** Zappy staff name → CRM provider id (Settings → Dentists). */
  staff: Record<string, string>
  defaultType: AppointmentType
  /** Used when the staff column is empty or unknown; null = no dentist set. */
  defaultProviderId: string | null
}

export function mapService(service: string, map: ZappyMap): { type: AppointmentType; known: boolean } {
  const n = norm(service)
  if (!n) return { type: map.defaultType, known: false }
  for (const [name, type] of Object.entries(map.services)) if (norm(name) === n) return { type, known: true }
  // "Destartarização + Branqueamento": first known part wins
  for (const part of service.split(/[+,/;]| e /)) {
    const p = norm(part)
    for (const [name, type] of Object.entries(map.services)) if (p && norm(name) === p) return { type, known: true }
  }
  return { type: map.defaultType, known: false }
}

export function mapStaff(staff: string, map: ZappyMap): { providerId: string | null; known: boolean } {
  const n = norm(staff)
  if (!n) return { providerId: map.defaultProviderId, known: false }
  for (const [name, id] of Object.entries(map.staff)) if (norm(name) === n) return { providerId: id, known: true }
  return { providerId: map.defaultProviderId, known: false }
}

export function phoneE164(raw: string): string | null {
  return toE164(raw)
}
