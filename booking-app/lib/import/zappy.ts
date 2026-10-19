/**
 * Zappy → CRM mapping. Pure: no database access (the script in scripts/import-zappy.ts does I/O).
 *
 * Zappy exports clients as CSV/Excel and bookings via the "Listagem de marcações" report
 * (or the Public API). Column names vary between versions/languages, so every field is
 * found through a list of aliases (accent- and case-insensitive). The mapping file
 * (scripts/zappy-map.json) translates Zappy services and staff into CRM types and dentists.
 */
import type { AppointmentStatus, AppointmentType } from '@/lib/generated/prisma/client'
import { toE164 } from '@/lib/clinic/phone'

export const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// ─── Columns ─────────────────────────────────────────────────────────────────

export const CLIENT_COLUMNS = {
  id: ['n cliente', 'no cliente', 'numero cliente', 'num cliente', 'id cliente', 'codigo cliente', 'cliente id', 'id', 'codigo', 'numero', 'client id', 'client number'],
  name: ['nome completo', 'nome', 'cliente', 'name', 'full name'],
  firstName: ['primeiro nome', 'nome proprio', 'first name'],
  lastName: ['apelido', 'apelidos', 'ultimo nome', 'last name', 'surname'],
  phone: ['telemovel', 'tlm', 'telefone', 'contacto', 'telefone 1', 'mobile', 'phone'],
  phone2: ['telefone 2', 'telefone fixo', 'outro telefone', 'phone 2'],
  email: ['email', 'e mail', 'correio eletronico'],
  nif: ['nif', 'contribuinte', 'n contribuinte', 'no contribuinte', 'numero de contribuinte', 'vat', 'tax number'],
  dob: ['data de nascimento', 'data nascimento', 'nascimento', 'aniversario', 'date of birth', 'birthday', 'birth date'],
  address: ['morada', 'endereco', 'address'],
  postalCode: ['codigo postal', 'cod postal', 'cp', 'postal code', 'zip'],
  city: ['localidade', 'cidade', 'city'],
  gender: ['genero', 'sexo', 'gender'],
  notes: ['observacoes', 'notas', 'obs', 'notes', 'comentarios'],
  origin: ['origem', 'como nos conheceu', 'source', 'origin'],
  marketingConsent: ['consentimento marketing', 'aceita marketing', 'rgpd marketing', 'marketing', 'consentimento rgpd', 'aceita comunicacoes'],
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
