/**
 * Clinic-time helpers.
 *
 * Every date or time a patient, staff member or the voice agent says
 * ("Tuesday at 09:30") is wall-clock time in the clinic's IANA zone
 * (Europe/Lisbon by default). Servers — Vercel especially — run in UTC, so
 * `new Date(y, m, d, h, mi)` would silently book an hour off during Portuguese
 * summer time. These helpers convert explicitly, using only Intl (no new deps).
 */

export const DEFAULT_TIMEZONE = 'Europe/Lisbon'
export const DEFAULT_LOCALE = 'pt-PT'

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isValidDateString(value: string): boolean {
  const m = DATE_RE.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

function splitDate(dateStr: string): [number, number, number] {
  const m = DATE_RE.exec(dateStr)
  if (!m) throw new Error(`Invalid date string: ${dateStr}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function minutesToHHMM(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Adds calendar days to a YYYY-MM-DD string (timezone-free). */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = splitDate(dateStr)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday for a calendar date (timezone-free). */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = splitDate(dateStr)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const out: Record<string, number> = {}
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute, second: out.second }
}

/** Offset of `timeZone` from UTC at `date`, in minutes (Lisbon: 0 in winter, 60 in summer). */
export function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000)
}

/**
 * The UTC instant of wall-clock `dateStr` + `hhmm` in `timeZone`.
 * During a DST gap (a wall time that doesn't exist) the result moves forward.
 */
export function zonedTimeToUtc(dateStr: string, hhmm: string, timeZone = DEFAULT_TIMEZONE): Date {
  const [y, m, d] = splitDate(dateStr)
  const [h, mi] = hhmm.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, mi, 0)
  const first = timeZoneOffsetMinutes(new Date(guess), timeZone)
  let instant = guess - first * 60_000
  const second = timeZoneOffsetMinutes(new Date(instant), timeZone)
  if (second !== first) instant = guess - second * 60_000
  return new Date(instant)
}

/** Wall-clock date/time of `date` in `timeZone`. */
export function utcToZoned(date: Date, timeZone = DEFAULT_TIMEZONE): { date: string; time: string; minutes: number; weekday: number } {
  const p = zonedParts(date, timeZone)
  const dateStr = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
  return {
    date: dateStr,
    time: minutesToHHMM(p.hour * 60 + p.minute),
    minutes: p.hour * 60 + p.minute,
    weekday: weekdayOf(dateStr),
  }
}

/** [start, end) UTC bounds of a clinic calendar day. */
export function dayBoundsUtc(dateStr: string, timeZone = DEFAULT_TIMEZONE): { start: Date; end: Date } {
  return {
    start: zonedTimeToUtc(dateStr, '00:00', timeZone),
    end: zonedTimeToUtc(addDays(dateStr, 1), '00:00', timeZone),
  }
}

/** Today's date in the clinic zone. */
export function todayInZone(timeZone = DEFAULT_TIMEZONE, now = new Date()): string {
  return utcToZoned(now, timeZone).date
}

/**
 * Parses spoken/typed times: "9:15", "09:15", "9h15", "14h", "9:15am", "2 pm", "14.30".
 * Returns HH:MM (24h) or null.
 */
export function parseTimeInput(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, '')
  const m = /^(\d{1,2})(?:[:h.](\d{2})?)?(am|pm)?$/.exec(t)
  if (!m) return null
  let hours = Number(m[1])
  const mins = m[2] ? Number(m[2]) : 0
  const ampm = m[3]
  if (ampm) {
    if (hours < 1 || hours > 12) return null
    if (ampm === 'pm' && hours !== 12) hours += 12
    if (ampm === 'am' && hours === 12) hours = 0
  }
  if (hours > 23 || mins > 59) return null
  return minutesToHHMM(hours * 60 + mins)
}

/** "terça-feira, 20 de outubro" */
export function formatDateLong(date: Date, timeZone = DEFAULT_TIMEZONE, locale = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(date)
}

/** "20/10/2026" */
export function formatDateShort(date: Date, timeZone = DEFAULT_TIMEZONE, locale = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

/** "09:30" */
export function formatTime(date: Date, timeZone = DEFAULT_TIMEZONE, locale = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
}

/** Label for a calendar date string, e.g. "terça-feira, 20 de outubro". */
export function formatDateStringLong(dateStr: string, locale = DEFAULT_LOCALE): string {
  // Noon UTC on that date is the same calendar day everywhere in Europe.
  const [y, m, d] = splitDate(dateStr)
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(Date.UTC(y, m - 1, d, 12)))
}
