// Date helpers for clinic wall-clock strings ("YYYY-MM-DD", "YYYY-MM-DDTHH:mm").
// Wall times are formatted as if they were UTC, so the browser's own time zone never shifts them.

export const STAFF_LOCALE = "en-GB"

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function startOfWeek(date: string): string {
  return addDays(date, -((weekday(date) + 6) % 7))
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`
}

export function endOfMonth(date: string): string {
  const [y, m] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, last))
  return target.toISOString().slice(0, 10)
}

const asUtc = (wall: string) => new Date(wall.length === 10 ? `${wall}T00:00:00Z` : `${wall}:00Z`)

export function fmt(wall: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(STAFF_LOCALE, { ...opts, timeZone: "UTC" }).format(asUtc(wall))
}

export const fmtDayLong = (date: string) => fmt(date, { weekday: "long", day: "numeric", month: "long" })
export const fmtDayShort = (date: string) => fmt(date, { weekday: "short", day: "numeric", month: "short" })
export const fmtTime = (wall: string) => wall.slice(11, 16)

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

export function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
}

/** A Date the calendar produced from a naive wall string → back to "YYYY-MM-DD" / "HH:mm". */
export function fromCalendarDate(d: Date): { date: string; time: string } {
  const p = (n: number) => String(n).padStart(2, "0")
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` }
}

export function minutesBetween(a: string, b: string): number {
  return Math.round((asUtc(b).getTime() - asUtc(a).getTime()) / 60_000)
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}
