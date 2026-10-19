/**
 * Caller identity verification for the voice agent.
 *
 * Nothing specific about a patient (appointments, bookings, cancellations) is
 * disclosed or changed until the caller gives the patient's full name AND
 * date of birth and both match exactly one record — server-side, not by the
 * model's judgement. The tool result never contains the DOB, insurance or
 * clinical data (minimum necessary).
 *
 * Records without a date of birth (imported from Zappy) can't be matched that
 * way. For those only, the server-side caller ID must match the record's phone
 * AND the spoken full name must match — the number comes from the carrier, not
 * from anything the caller says.
 */
import prisma from '@/lib/prisma'
import { digitsOnly, phonesMatch } from '@/lib/clinic/phone'

export function normaliseName(raw: string): string[] {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents: "João" → "joao"
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/[\s-]+/)
    .map((t) => t.replace(/'/g, ''))
    .filter((t) => t.length > 0 && !['da', 'de', 'do', 'das', 'dos', 'e'].includes(t))
}

/**
 * Portuguese naming: callers usually say first name + last surname
 * ("Maria Santos" for "Maria João Silva Santos"). Require the first given name
 * to match and the spoken last token to be one of the patient's surnames.
 */
export function nameMatches(spoken: string, firstName: string, lastName: string): boolean {
  const s = normaliseName(spoken)
  if (s.length < 2) return false
  const given = normaliseName(firstName)
  const surnames = normaliseName(lastName)
  if (given.length === 0 || surnames.length === 0) return false
  return s[0] === given[0] && surnames.includes(s[s.length - 1])
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (day first, as said in Portugal). */
export function parseDateOfBirth(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  let y: number, m: number, d: number
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (match) {
    ;[y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else {
    match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t)
    if (!match) return null
    ;[d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])]
  }
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  if (y < 1900 || dt.getTime() > Date.now()) return null
  return dt.toISOString().slice(0, 10)
}

/** DOBs are stored as a date at UTC midnight; compare by UTC calendar day. */
export function dobKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export type IdentityCandidate = { id: string; firstName: string; lastName: string; dateOfBirth: Date | null }

export type VerifyOutcome<T extends IdentityCandidate = IdentityCandidate> =
  | { status: 'verified'; patient: T; via: 'dob' | 'caller_id' }
  | { status: 'needs_full_name' }
  | { status: 'needs_dob' }
  | { status: 'not_found' }
  | { status: 'ambiguous' }

export function matchCandidates<T extends IdentityCandidate>(candidates: T[], fullName: string, dob: string): VerifyOutcome<T> {
  const matches = candidates.filter((c) => c.dateOfBirth !== null && dobKey(c.dateOfBirth) === dob && nameMatches(fullName, c.firstName, c.lastName))
  if (matches.length === 0) return { status: 'not_found' }
  if (matches.length > 1) return { status: 'ambiguous' }
  return { status: 'verified', patient: matches[0], via: 'dob' }
}

/**
 * Fallback for records with no DOB on file: caller ID matches the record's phone and the
 * spoken name matches. Exactly one such record, or nothing.
 */
export function matchByCallerId<T extends IdentityCandidate & { phone: string | null }>(candidates: T[], fullName: string, callerPhone: string): VerifyOutcome<T> {
  const matches = candidates.filter((c) => c.dateOfBirth === null && phonesMatch(c.phone, callerPhone) && nameMatches(fullName, c.firstName, c.lastName))
  if (matches.length === 0) return { status: 'not_found' }
  if (matches.length > 1) return { status: 'ambiguous' }
  return { status: 'verified', patient: matches[0], via: 'caller_id' }
}

export type VerifiedPatient = IdentityCandidate & { preferredProvider: string | null }

export async function verifyCaller(args: { fullName: unknown; dateOfBirth: unknown; callerPhone?: string | null }): Promise<VerifyOutcome<VerifiedPatient>> {
  const fullName = typeof args.fullName === 'string' ? args.fullName.trim() : ''
  if (normaliseName(fullName).length < 2) return { status: 'needs_full_name' }
  const dob = parseDateOfBirth(args.dateOfBirth)
  if (!dob) return { status: 'needs_dob' }

  const dayStart = new Date(`${dob}T00:00:00.000Z`)
  // ±1 day window tolerates DOBs saved with a timezone offset; the exact day is checked in matchCandidates.
  const candidates = await prisma.patient.findMany({
    where: {
      dateOfBirth: { gte: new Date(dayStart.getTime() - 86_400_000), lt: new Date(dayStart.getTime() + 2 * 86_400_000) },
      status: { notIn: ['ARCHIVED', 'DRAFT'] },
    },
    select: { id: true, firstName: true, lastName: true, dateOfBirth: true, preferredProvider: true },
    take: 200,
  })
  const byDob = matchCandidates(candidates, fullName, dob)
  if (byDob.status !== 'not_found') return byDob

  const last3 = args.callerPhone ? digitsOnly(args.callerPhone).slice(-3) : ''
  if (last3.length < 3) return byDob
  // Narrow in SQL by the last three digits (contiguous in any common format), then compare properly.
  const noDob = await prisma.patient.findMany({
    where: { dateOfBirth: null, status: { notIn: ['ARCHIVED', 'DRAFT'] }, phone: { contains: last3 } },
    select: { id: true, firstName: true, lastName: true, dateOfBirth: true, preferredProvider: true, phone: true },
    take: 200,
  })
  const byPhone = matchByCallerId(noDob, fullName, args.callerPhone!)
  if (byPhone.status !== 'verified') return byPhone.status === 'ambiguous' ? byPhone : byDob
  const p = byPhone.patient
  return { status: 'verified', patient: { id: p.id, firstName: p.firstName, lastName: p.lastName, dateOfBirth: p.dateOfBirth, preferredProvider: p.preferredProvider }, via: 'caller_id' }
}
