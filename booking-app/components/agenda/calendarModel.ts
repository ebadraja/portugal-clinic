// Pure mapping from the agenda payload to @event-calendar inputs.
import type { Calendar } from "@event-calendar/core"
import type { AgendaAppointment, AgendaBlock, AgendaPayload, AgendaProvider, AgendaView } from "./types"
import { BLOCK_KIND_LABEL, REMINDER_LABEL, SOURCE_LABEL, STATUS_LABEL } from "./strings"
import { DAY_NAMES, addDays, escapeHtml, fmtTime, hhmm, toMinutes, weekday } from "./wall"

export type ColorBy = "type" | "provider"

/** Agenda filters. Empty lists mean "all". */
export type EventFilter = {
  statuses: ("SCHEDULED" | "CONFIRMED" | "ARRIVED" | "COMPLETED" | "NO_SHOW" | "CANCELLED")[]
  sources: ("STAFF" | "VOICE_AGENT" | "ONLINE" | "IMPORT")[]
  types: string[]
  alertsOnly: boolean
}

export const EMPTY_FILTER: EventFilter = { statuses: [], sources: [], types: [], alertsOnly: false }

export function activeFilterCount(f: EventFilter): number {
  return f.statuses.length + f.sources.length + f.types.length + (f.alertsOnly ? 1 : 0)
}

/** The status a person sees: "arrived" sits between confirmed and completed. */
export function displayStatus(a: Pick<AgendaAppointment, "status" | "checkedInAt">): EventFilter["statuses"][number] | "RESCHEDULED" {
  if (a.checkedInAt && (a.status === "SCHEDULED" || a.status === "CONFIRMED")) return "ARRIVED"
  return a.status
}

export function sourceGroup(bookedVia: string): EventFilter["sources"][number] {
  if (bookedVia === "VOICE_AGENT") return "VOICE_AGENT"
  if (bookedVia === "IMPORT") return "IMPORT"
  if (bookedVia === "WEBSITE" || bookedVia === "PATIENT_LINK" || bookedVia === "CHATBOT") return "ONLINE"
  return "STAFF"
}

export function matchesFilter(a: AgendaAppointment, f: EventFilter): boolean {
  const st = displayStatus(a)
  if (f.statuses.length && !f.statuses.includes(st as EventFilter["statuses"][number])) return false
  if (f.sources.length && !f.sources.includes(sourceGroup(a.bookedVia))) return false
  if (f.types.length && !f.types.includes(a.type)) return false
  if (f.alertsOnly && a.alerts.clinical.length === 0) return false
  return true
}

/** Counts for the toolbar ("12 booked · 8 confirmed · 3 to confirm"). */
export function rangeStats(appts: AgendaAppointment[]) {
  const live = appts.filter((a) => a.status === "SCHEDULED" || a.status === "CONFIRMED" || a.status === "COMPLETED")
  return {
    total: live.length,
    confirmed: live.filter((a) => a.status !== "SCHEDULED").length,
    toConfirm: live.filter((a) => a.status === "SCHEDULED").length,
    arrived: live.filter((a) => !!a.checkedInAt && a.status !== "COMPLETED").length,
    noShows: appts.filter((a) => a.status === "NO_SHOW").length,
    byAgent: live.filter((a) => a.bookedVia === "VOICE_AGENT").length,
  }
}

/** Plain-text summary shown when hovering an appointment. */
export function eventTooltip(a: AgendaAppointment, payload: AgendaPayload): string {
  const type = payload.appointmentTypes.find((t) => t.type === a.type)?.label ?? a.type
  return [
    `${fmtTime(a.start)}–${fmtTime(a.end)} · ${a.patientName}`,
    `${type}${a.provider ? ` · ${a.provider}` : ""}`,
    `${STATUS_LABEL[displayStatus(a) === "ARRIVED" ? "CONFIRMED" : a.status] ?? a.status}${a.checkedInAt ? " · arrived" : ""} · ${SOURCE_LABEL[a.bookedVia] ?? a.bookedVia}`,
    a.patientPhone ? `☎ ${a.patientPhone}` : "",
    a.alerts.clinical.length ? `⚠ ${a.alerts.clinical.join(", ")}` : "",
    a.notes ? `Notes: ${a.notes.slice(0, 160)}` : "",
    REMINDER_LABEL[a.reminder],
  ].filter(Boolean).join("\n")
}

export const CALENDAR_VIEW: Record<AgendaView, string> = {
  day: "resourceTimeGridDay",
  week: "timeGridWeek",
  month: "dayGridMonth",
  list: "listWeek",
}

export function visibleProviders(payload: AgendaPayload, filter: string[] | null): AgendaProvider[] {
  const active = payload.providers.filter((p) => p.active)
  return filter ? active.filter((p) => filter.includes(p.id)) : active
}

export function rangeFor(view: AgendaView, date: string): { from: string; to: string } {
  if (view === "day") return { from: date, to: date }
  if (view === "month") {
    const first = `${date.slice(0, 7)}-01`
    const from = addDays(first, -((weekday(first) + 6) % 7))
    return { from, to: addDays(from, 41) }
  }
  const from = addDays(date, -((weekday(date) + 6) % 7))
  return { from, to: addDays(from, 6) }
}

/** Earliest open / latest close across the week (± 30 min), widened for anything booked outside. */
export function timeBounds(payload: AgendaPayload): { slotMinTime: string; slotMaxTime: string; scrollTime: string } {
  const open = payload.businessHours.filter((h) => h.enabled)
  let min = open.length ? Math.min(...open.map((h) => toMinutes(h.open))) : 8 * 60
  let max = open.length ? Math.max(...open.map((h) => toMinutes(h.close))) : 19 * 60
  for (const a of payload.appointments) {
    min = Math.min(min, toMinutes(fmtTime(a.start)))
    max = Math.max(max, a.end.slice(0, 10) > a.start.slice(0, 10) ? 24 * 60 : toMinutes(fmtTime(a.end)))
  }
  min = Math.max(0, Math.floor((min - 30) / 30) * 30)
  max = Math.min(24 * 60, Math.ceil((max + 30) / 30) * 30)
  return { slotMinTime: `${hhmm(min)}:00`, slotMaxTime: `${hhmm(max)}:00`, scrollTime: `${hhmm(min)}:00` }
}

/** Days the clinic never opens (hidden unless "show weekends"). */
export function closedWeekdays(payload: AgendaPayload): number[] {
  return payload.businessHours.filter((h) => !h.enabled).map((h) => DAY_NAMES.indexOf(h.day as (typeof DAY_NAMES)[number])).filter((i) => i >= 0)
}

function typeOf(payload: AgendaPayload, type: string) {
  return payload.appointmentTypes.find((t) => t.type === type)
}

function accentFor(a: AgendaAppointment, payload: AgendaPayload, colorBy: ColorBy): string {
  if (colorBy === "provider") return payload.providers.find((p) => p.id === a.providerId)?.color ?? "#64748b"
  return typeOf(payload, a.type)?.color ?? "#64748b"
}

export function eventHtml(a: AgendaAppointment, payload: AgendaPayload, compact: boolean): string {
  const label = typeOf(payload, a.type)?.label ?? a.type
  const chips: string[] = []
  if (a.reminder !== "none") chips.push(`<span class="agenda-dot agenda-dot--${a.reminder}" title="${escapeHtml(REMINDER_LABEL[a.reminder])}"></span>`)
  if (a.status === "CONFIRMED") chips.push(`<span class="agenda-chip agenda-chip--ok" title="Confirmed${a.confirmedVia ? ` (${escapeHtml(a.confirmedVia)})` : ""}">✓</span>`)
  if (a.checkedInAt && a.status !== "COMPLETED") chips.push(`<span class="agenda-chip agenda-chip--in" title="Arrived">In</span>`)
  if (a.bookedVia === "VOICE_AGENT") chips.push(`<span class="agenda-chip agenda-chip--ai" title="${escapeHtml(SOURCE_LABEL.VOICE_AGENT)}">AI</span>`)
  if (a.bookedVia === "WEBSITE" || a.bookedVia === "PATIENT_LINK") chips.push(`<span class="agenda-chip" title="Booked online">@</span>`)
  if (a.seriesId) chips.push(`<span class="agenda-chip" title="Part of a series">↻</span>`)
  if (a.alerts.clinical.length) chips.push(`<span class="agenda-chip agenda-chip--alert" title="${escapeHtml(a.alerts.clinical.join(', '))}">!</span>`)
  if (a.alerts.birthday) chips.push(`<span class="agenda-chip" title="Birthday this week">🎂</span>`)
  if (a.alerts.newPatient) chips.push(`<span class="agenda-chip agenda-chip--new" title="First visit">New</span>`)
  if (a.allowedOverlap) chips.push(`<span class="agenda-chip agenda-chip--warn" title="Double-booked on purpose">2×</span>`)
  const status = a.status === "SCHEDULED" || a.status === "CONFIRMED" ? "" : ` · ${escapeHtml(STATUS_LABEL[a.status] ?? a.status)}`
  if (compact) {
    return `<div class="agenda-ev__row"><span class="agenda-ev__time">${fmtTime(a.start)}</span> <span class="agenda-ev__name">${escapeHtml(a.patientName)}</span>${chips.join("")}</div>`
  }
  return `<div class="agenda-ev__row"><span class="agenda-ev__time">${fmtTime(a.start)}–${fmtTime(a.end)}</span><span class="agenda-ev__chips">${chips.join("")}</span></div>`
    + `<div class="agenda-ev__name">${escapeHtml(a.patientName)}</div>`
    + `<div class="agenda-ev__meta">${escapeHtml(label)}${status}</div>`
}

export function blockHtml(b: AgendaBlock): string {
  return `<div class="agenda-ev__meta">${escapeHtml(b.reason || BLOCK_KIND_LABEL[b.kind] || "Blocked")}</div>`
}

export function buildResources(payload: AgendaPayload, filter: string[] | null): Calendar.ResourceInput[] {
  const providers = visibleProviders(payload, filter)
  const out: Calendar.ResourceInput[] = providers.map((p) => ({ id: p.id, title: p.name, extendedProps: { color: p.color } }))
  const ids = new Set(providers.map((p) => p.id))
  // Unassigned, or with a dentist who is no longer active: they still need a column.
  const hasUnassigned = payload.appointments.some((a) => !a.providerId || (!filter && !ids.has(a.providerId)))
  if (hasUnassigned || out.length === 0) out.push({ id: "__none", title: out.length === 0 ? "Agenda" : "No dentist set", extendedProps: { color: "#94a3b8" } })
  return out
}

function closedIntervals(date: string, payload: AgendaPayload, provider: AgendaProvider | null, bounds: { min: number; max: number }): [number, number][] {
  const dayName = DAY_NAMES[weekday(date)]
  const hours = payload.businessHours.find((h) => h.day === dayName)
  if (!hours?.enabled || payload.closures.some((c) => c.date === date)) return [[bounds.min, bounds.max]]
  const open: [number, number][] = provider?.workingHours
    ? provider.workingHours.filter((w) => w.weekday === weekday(date)).map((w) => [Math.max(toMinutes(w.start), toMinutes(hours.open)), Math.min(toMinutes(w.end), toMinutes(hours.close))] as [number, number]).filter(([s, e]) => e > s)
    : [[toMinutes(hours.open), toMinutes(hours.close)]]
  const lunch = payload.lunchBreak.enabled ? [toMinutes(payload.lunchBreak.start), toMinutes(payload.lunchBreak.end)] : null
  const windows = open
    .flatMap(([s, e]): [number, number][] => (lunch && s < lunch[1] && e > lunch[0] ? [[s, Math.min(e, lunch[0])], [Math.max(s, lunch[1]), e]] : [[s, e]]))
    .filter(([s, e]) => e > s)
    .sort((x, y) => x[0] - y[0])
  const closed: [number, number][] = []
  let cursor = bounds.min
  for (const [s, e] of windows) {
    if (s > cursor) closed.push([cursor, s])
    cursor = Math.max(cursor, e)
  }
  if (cursor < bounds.max) closed.push([cursor, bounds.max])
  return closed
}

export function buildEvents(
  payload: AgendaPayload,
  opts: { view: AgendaView; colorBy: ColorBy; filter: string[] | null; editable: boolean; eventFilter?: EventFilter },
): Calendar.EventInput[] {
  const providers = visibleProviders(payload, opts.filter)
  const ids = new Set(providers.map((p) => p.id))
  const resourceView = opts.view === "day"
  const singleProvider = providers.length === 1 ? providers[0] : null
  const out: Calendar.EventInput[] = []

  for (const a of payload.appointments) {
    if (opts.filter && a.providerId && !ids.has(a.providerId)) continue
    if (opts.eventFilter && !matchesFilter(a, opts.eventFilter)) continue
    const accent = accentFor(a, payload, opts.colorBy)
    const inactive = a.status === "CANCELLED" || a.status === "NO_SHOW" || a.status === "RESCHEDULED"
    out.push({
      id: a.id,
      start: a.start,
      end: a.end,
      resourceIds: [a.providerId && ids.has(a.providerId) ? a.providerId : "__none"],
      title: a.patientName,
      editable: opts.editable && !inactive && a.status !== "COMPLETED",
      classNames: ["agenda-ev", `agenda-ev--${a.status.toLowerCase()}`, ...(a.checkedInAt ? ["agenda-ev--arrived"] : [])],
      styles: [`--agenda-accent: ${accent}`],
      extendedProps: { kind: "appointment", appt: a },
    })
  }

  for (const b of payload.blocks) {
    if (opts.filter && b.providerId && !ids.has(b.providerId)) continue
    out.push({
      id: `block:${b.id}`,
      start: b.start,
      end: b.end,
      resourceIds: b.providerId ? [b.providerId] : [...providers.map((p) => p.id), "__none"],
      title: b.reason ?? BLOCK_KIND_LABEL[b.kind] ?? "Blocked",
      editable: false,
      classNames: ["agenda-block"],
      extendedProps: { kind: "block", block: b },
    })
  }

  // Shade time nobody can be booked: clinic closed, lunch, outside each dentist's hours.
  if (opts.view === "day" || opts.view === "week") {
    const tb = timeBounds(payload)
    const bounds = { min: toMinutes(tb.slotMinTime.slice(0, 5)), max: toMinutes(tb.slotMaxTime.slice(0, 5)) }
    for (let d = payload.from; d <= payload.to; d = addDays(d, 1)) {
      const targets: (AgendaProvider | null)[] = resourceView ? providers : [singleProvider]
      for (const p of targets) {
        for (const [s, e] of closedIntervals(d, payload, p, bounds)) {
          out.push({
            id: `off:${d}:${p?.id ?? "all"}:${s}`,
            start: `${d}T${hhmm(s)}`,
            end: `${d}T${hhmm(Math.min(e, 24 * 60 - 1))}`,
            display: "background",
            classNames: ["agenda-off"],
            ...(resourceView && p ? { resourceIds: [p.id] } : {}),
            extendedProps: { kind: "off" },
          })
        }
      }
    }
  }
  return out
}
