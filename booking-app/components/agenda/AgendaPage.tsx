"use client"

/**
 * The agenda: one calendar for the desk, Acácia and patient self-service.
 * Data comes from /api/agenda (clinic wall time); every change goes through the booking
 * service via /api/agenda/appointments, so the rules are the same as the voice agent's.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Calendar } from "@event-calendar/core"
import { Ban, CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, Printer, RefreshCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/toast-provider"
import "./agenda.css"
import { EventCalendar } from "./EventCalendar"
import { BookingDialog } from "./BookingDialog"
import { AppointmentDrawer } from "./AppointmentDrawer"
import { BlockDialog, type BlockDraft } from "./BlockDialog"
import { SidePanel } from "./SidePanel"
import { CALENDAR_VIEW, blockHtml, buildEvents, buildResources, closedWeekdays, eventHtml, rangeFor, timeBounds, type ColorBy } from "./calendarModel"
import type { AgendaAppointment, AgendaBlock, AgendaPayload, AgendaView, BookingDraft, Issue } from "./types"
import { ISSUE_LABEL } from "./strings"
import { addDays, addMonths, fmt, fmtDayLong, fmtDayShort, fromCalendarDate, minutesBetween } from "./wall"

type Props = {
  today: string
  canWrite: boolean
  canDoubleBook: boolean
  /** The signed-in user's own dentist column, if they are a dentist. */
  myProviderId: string | null
  initialAppointmentId: string | null
  bookingFor: { id: string; name: string } | null
}

type PendingMove = {
  appt: AgendaAppointment
  date: string
  time: string
  duration: number
  providerId: string | null
  revert: () => void
  notify: boolean
  issues: Issue[] | null
  conflict: boolean
  busy: boolean
}

type SelectMenu = { x: number; y: number; date: string; start: string; end: string; providerId: string | null }

const VIEWS: { id: AgendaView; label: string; key: string }[] = [
  { id: "day", label: "Day", key: "d" },
  { id: "week", label: "Week", key: "w" },
  { id: "month", label: "Month", key: "m" },
  { id: "list", label: "List", key: "l" },
]

function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
  } catch {
    return fallback
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode */
  }
}

export function AgendaPage({ today, canWrite, canDoubleBook, myProviderId, initialAppointmentId, bookingFor: initialBookingFor }: Props) {
  const { showToast } = useToast()
  // Rendered client-only (see AgendaClient), so browser preferences can seed state directly.
  const [view, setViewState] = useState<AgendaView>(() => readPref("agenda.view", ["day", "week", "month", "list"] as const, window.innerWidth < 768 ? "list" : "day"))
  const [date, setDate] = useState(today)
  const [colorBy, setColorByState] = useState<ColorBy>(() => readPref("agenda.colorBy", ["type", "provider"] as const, "type"))
  const [showWeekends, setShowWeekends] = useState(() => readPref("agenda.weekends", ["1", "0"] as const, "0") === "1")
  const [showCancelled, setShowCancelled] = useState(false)
  const [filter, setFilter] = useState<string[] | null>(myProviderId ? [myProviderId] : null)
  const [data, setData] = useState<AgendaPayload | null>(null)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const [drawerId, setDrawerId] = useState<string | null>(initialAppointmentId)
  const [booking, setBooking] = useState<BookingDraft | null>(null)
  const [blockDraft, setBlockDraft] = useState<BlockDraft | null>(null)
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  const [selectMenu, setSelectMenu] = useState<SelectMenu | null>(null)
  const [bookingFor, setBookingFor] = useState(initialBookingFor)
  const loadedAt = useRef<string | null>(null)

  const setView = useCallback((v: AgendaView) => {
    setViewState(v)
    writePref("agenda.view", v)
  }, [])
  const setColorBy = (c: ColorBy) => {
    setColorByState(c)
    writePref("agenda.colorBy", c)
  }

  const range = useMemo(() => rangeFor(view, date), [view, date])
  const requestKey = `${range.from}|${range.to}|${showCancelled ? 1 : 0}`
  const loading = loadedKey !== requestKey

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agenda?from=${range.from}&to=${range.to}${showCancelled ? "&includeCancelled=1" : ""}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? "Failed to load the agenda")
      setData(d)
      loadedAt.current = d.serverTime
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadedKey(`${range.from}|${range.to}|${showCancelled ? 1 : 0}`)
    }
  }, [range.from, range.to, showCancelled])

  useEffect(() => {
    const ctrl = new AbortController()
    const key = `${range.from}|${range.to}|${showCancelled ? 1 : 0}`
    fetch(`/api/agenda?from=${range.from}&to=${range.to}${showCancelled ? "&includeCancelled=1" : ""}`, { signal: ctrl.signal })
      .then(async (res) => {
        const d = await res.json()
        if (!res.ok) throw new Error(d.error ?? "Failed to load the agenda")
        setData(d)
        loadedAt.current = d.serverTime
        setError(null)
        setLoadedKey(key)
      })
      .catch((e: Error) => {
        if (e.name === "AbortError") return
        setError(e.message)
        setLoadedKey(key)
      })
    return () => ctrl.abort()
  }, [range.from, range.to, showCancelled])

  const refresh = useCallback((message?: string) => {
    if (message) showToast(message, "success")
    setVersion((v) => v + 1)
    void load()
  }, [load, showToast])

  // Live updates: Acácia and patients change the agenda while you look at it.
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden || !loadedAt.current || pendingMove) return
      try {
        const res = await fetch(`/api/agenda/pulse?since=${encodeURIComponent(loadedAt.current)}`)
        if (!res.ok) return
        const p = await res.json()
        for (const e of p.events ?? []) {
          const who = e.actor === "VOICE_AGENT" ? "Acácia" : "Patient"
          const what = e.kind === "CREATED" ? "booked" : e.kind === "CANCELLED" ? "cancelled" : e.kind === "RESCHEDULED" ? "moved" : e.kind === "CONFIRMED" ? "confirmed" : e.kind === "RESCHEDULE_REQUESTED" ? "asked to reschedule" : "updated"
          showToast(`${who} ${what}: ${e.patientName} — ${fmtDayShort(e.start.slice(0, 10))} ${e.start.slice(11, 16)}`, e.kind === "CANCELLED" ? "warning" : "info")
        }
        if (p.changed) {
          setVersion((v) => v + 1)
          void load()
        } else if (p.events?.length) {
          loadedAt.current = new Date().toISOString()
        }
      } catch {
        /* offline */
      }
    }, 20_000)
    return () => clearInterval(t)
  }, [load, pendingMove, showToast])

  // ── navigation ──
  const step = useCallback((dir: 1 | -1) => {
    setDate((d) => (view === "day" ? addDays(d, dir) : view === "month" ? addMonths(d, dir) : addDays(d, 7 * dir)))
  }, [view])

  const openBooking = useCallback((draft: Omit<BookingDraft, "mode"> & { mode?: BookingDraft["mode"] }) => {
    if (!canWrite) return
    setBooking({ mode: "create", patient: bookingFor, ...draft })
  }, [bookingFor, canWrite])

  // Keyboard: T today · D/W/M/L views · N new · ←/→ navigate
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return
      if (booking || blockDraft || drawerId) return
      const k = e.key.toLowerCase()
      if (k === "t") setDate(today)
      else if (k === "arrowleft") step(-1)
      else if (k === "arrowright") step(1)
      else if (k === "n") openBooking({ date: view === "day" ? date : today, time: "09:30", providerId: filter?.length === 1 ? filter[0] : null })
      else {
        const v = VIEWS.find((x) => x.key === k)
        if (v) setView(v.id)
        else return
      }
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [booking, blockDraft, drawerId, today, step, openBooking, view, date, filter, setView])

  // ── calendar callbacks ──
  const onDateClick = useCallback((info: Calendar.DateClickInfo) => {
    setSelectMenu(null)
    const { date: d, time } = fromCalendarDate(info.date)
    if (view === "month" || info.allDay) {
      setDate(d)
      setView("day")
      return
    }
    openBooking({ date: d, time, providerId: info.resource?.id ? String(info.resource.id) : filter?.length === 1 ? filter[0] : null })
  }, [view, openBooking, filter, setView])

  const onSelect = useCallback((info: Calendar.SelectInfo) => {
    if (!canWrite || info.allDay) return
    const s = fromCalendarDate(info.start)
    const e = fromCalendarDate(info.end)
    const ev = info.jsEvent as MouseEvent
    setSelectMenu({
      x: Math.min(ev.clientX ?? 200, window.innerWidth - 220),
      y: Math.min(ev.clientY ?? 200, window.innerHeight - 120),
      date: s.date,
      start: s.time,
      end: e.time,
      providerId: info.resource?.id ? String(info.resource.id) : filter?.length === 1 ? filter[0] : null,
    })
  }, [canWrite, filter])

  const onEventClick = useCallback((info: Calendar.EventClickInfo) => {
    const props = info.event.extendedProps as { kind?: string; appt?: AgendaAppointment; block?: AgendaBlock }
    if (props.kind === "appointment" && props.appt) setDrawerId(props.appt.id)
    if (props.kind === "block" && props.block) setBlockDraft({ mode: "view", block: props.block })
  }, [])

  const stageMove = useCallback((info: Calendar.EventDropInfo | Calendar.EventResizeInfo, newResourceId?: string | null) => {
    const appt = (info.event.extendedProps as { appt?: AgendaAppointment }).appt
    if (!appt) return info.revert()
    setPendingMove((prev) => {
      prev?.revert()
      const s = fromCalendarDate(info.event.start)
      const duration = Math.round((info.event.end.getTime() - info.event.start.getTime()) / 60_000)
      const providerId = newResourceId === undefined ? appt.providerId : newResourceId === "__none" ? null : newResourceId
      return { appt, date: s.date, time: s.time, duration, providerId, revert: info.revert, notify: true, issues: null, conflict: false, busy: false }
    })
  }, [])

  const onEventDrop = useCallback((info: Calendar.EventDropInfo) => {
    stageMove(info, info.newResource ? String(info.newResource.id) : undefined)
  }, [stageMove])
  const onEventResize = useCallback((info: Calendar.EventResizeInfo) => stageMove(info), [stageMove])

  async function confirmMove(opts: { acknowledgeWarnings?: boolean; allowOverlap?: boolean } = {}) {
    if (!pendingMove) return
    const m = pendingMove
    setPendingMove({ ...m, busy: true })
    const res = await fetch(`/api/agenda/appointments/${m.appt.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "move", date: m.date, time: m.time, durationMinutes: m.duration, providerId: m.providerId, notifyPatient: m.notify, ...opts }),
    })
    const d = await res.json().catch(() => ({}))
    if (res.status === 422) return setPendingMove({ ...m, busy: false, issues: d.issues ?? [], conflict: false })
    if (res.status === 409) return setPendingMove({ ...m, busy: false, issues: d.issues ?? [{ reason: "conflict" }], conflict: true })
    if (!res.ok) {
      m.revert()
      setPendingMove(null)
      showToast(d.error ?? "Could not move the appointment", "error")
      return
    }
    setPendingMove(null)
    refresh(`Moved ${m.appt.patientName} to ${fmtDayShort(m.date)} ${m.time}.`)
  }

  function cancelMove() {
    pendingMove?.revert()
    setPendingMove(null)
  }

  // ── calendar options ──
  const calendarOptions = useMemo<Calendar.Options>(() => {
    if (!data) return {}
    const providers = data.providers.filter((p) => p.active)
    const bounds = timeBounds(data)
    const resourceView = view === "day" && providers.length > 0
    return {
      view: resourceView ? CALENDAR_VIEW.day : view === "day" ? "timeGridDay" : CALENDAR_VIEW[view],
      date,
      locale: "en-GB",
      firstDay: 1,
      headerToolbar: { start: "", center: "", end: "" },
      height: view === "month" || view === "list" ? "auto" : "calc(100vh - 230px)",
      allDaySlot: false,
      nowIndicator: true,
      slotDuration: "00:15:00",
      slotLabelInterval: "00:30:00",
      snapDuration: "00:05:00",
      slotHeight: 22,
      slotMinTime: bounds.slotMinTime,
      slotMaxTime: bounds.slotMaxTime,
      scrollTime: bounds.scrollTime,
      hiddenDays: showWeekends ? [] : (closedWeekdays(data) as Calendar.dayOfWeek[]),
      dayMaxEvents: true,
      editable: canWrite,
      eventDurationEditable: canWrite,
      selectable: canWrite,
      selectMinDistance: 8,
      eventLongPressDelay: 400,
      resources: buildResources(data, filter),
      events: buildEvents(data, { view, colorBy, filter, editable: canWrite }),
      eventContent: (info: Calendar.EventContentInfo) => {
        const p = info.event.extendedProps as { kind?: string; appt?: AgendaAppointment; block?: AgendaBlock }
        if (p.kind === "appointment" && p.appt) return { html: eventHtml(p.appt, data, view === "month" || info.view.type.startsWith("list")) }
        if (p.kind === "block" && p.block) return { html: blockHtml(p.block) }
        return undefined
      },
      dayHeaderFormat: view === "week" ? WEEK_HEADER : DAY_HEADER,
      slotLabelFormat: TIME_FMT,
      eventTimeFormat: TIME_FMT,
      listDayFormat: DAY_HEADER,
      dateClick: onDateClick,
      select: onSelect,
      eventClick: onEventClick,
      eventDrop: onEventDrop,
      eventResize: onEventResize,
      noEventsContent: "No appointments",
    }
  }, [data, view, date, filter, colorBy, showWeekends, canWrite, onDateClick, onSelect, onEventClick, onEventDrop, onEventResize])

  const title = view === "day"
    ? fmtDayLong(date)
    : view === "month"
      ? fmt(date, { month: "long", year: "numeric" })
      : `${fmt(range.from, { day: "numeric", month: "short" })} – ${fmt(range.to, { day: "numeric", month: "short", year: "numeric" })}`

  const providers = data?.providers.filter((p) => p.active) ?? []
  const closuresInView = data?.closures.filter((c) => c.date >= range.from && c.date <= range.to) ?? []
  const toggleProvider = (id: string) => {
    setFilter((f) => {
      const all = providers.map((p) => p.id)
      const cur = f ?? all
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
      return next.length === 0 || next.length === all.length ? null : next
    })
  }

  return (
    <div className="agenda-root grid gap-3">
      {/* Toolbar */}
      <div className="agenda-noprint flex flex-wrap items-center gap-2">
        <h1 className="mr-1 flex items-center gap-2 text-xl font-semibold tracking-tight">
          <CalendarDays className="h-5 w-5 text-blue-600" /> Agenda
        </h1>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setDate(today)} title="Today (T)">Today</Button>
          <Button variant="ghost" size="icon-sm" aria-label="Previous" onClick={() => step(-1)}><ChevronLeft /></Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next" onClick={() => step(1)}><ChevronRight /></Button>
          <input type="date" aria-label="Go to date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 text-xs dark:bg-input/30" />
        </div>
        <span className="text-sm font-medium capitalize text-slate-700 dark:text-slate-200">{title}</span>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="View" className="flex rounded-lg border border-border p-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                role="tab"
                aria-selected={view === v.id}
                title={`${v.label} (${v.key.toUpperCase()})`}
                onClick={() => setView(v.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${view === v.id ? "bg-blue-600 text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Print" title="Print" onClick={() => window.print()}><Printer /></Button>
          <Button variant="ghost" size="icon-sm" aria-label="Refresh" title="Refresh" onClick={() => refresh()}><RefreshCw /></Button>
          {canWrite && (
            <>
              <Button variant="outline" size="sm" onClick={() => setBlockDraft({ mode: "create", date: view === "day" ? date : today, start: "12:30", end: "14:00", providerId: filter?.length === 1 ? filter[0] : null })}>
                <Ban /> Block time
              </Button>
              <Button size="sm" onClick={() => openBooking({ date: view === "day" ? date : today, time: "09:30", providerId: filter?.length === 1 ? filter[0] : null })} title="New appointment (N)">
                <Plus /> New appointment
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      {data && (
        <div className="agenda-noprint flex flex-wrap items-center gap-2 text-xs">
          {providers.length > 1 && providers.map((p) => {
            const on = !filter || filter.includes(p.id)
            return (
              <button key={p.id} onClick={() => toggleProvider(p.id)} aria-pressed={on} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${on ? "border-border bg-card" : "border-dashed border-border text-muted-foreground opacity-60"}`}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} /> {p.name}
              </button>
            )
          })}
          <span className="text-muted-foreground">Colour by</span>
          <select value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)} className="h-7 rounded-md border border-input bg-background px-1.5 dark:bg-input/30" aria-label="Colour by">
            <option value="type">appointment type</option>
            <option value="provider">dentist</option>
          </select>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Show cancelled
          </label>
          {view !== "day" && (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={showWeekends} onChange={(e) => { setShowWeekends(e.target.checked); writePref("agenda.weekends", e.target.checked ? "1" : "0") }} /> Closed days
            </label>
          )}
        </div>
      )}

      {bookingFor && (
        <div className="agenda-noprint flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
          <span>Booking for <strong>{bookingFor.name}</strong> — click a free time, or use “Next free slots”.</span>
          <Button variant="ghost" size="icon-sm" aria-label="Stop booking for this patient" onClick={() => setBookingFor(null)}><X /></Button>
        </div>
      )}
      {closuresInView.length > 0 && (
        <p className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          Clinic closed: {closuresInView.map((c) => `${fmtDayShort(c.date)} (${c.name})`).join(" · ")}
        </p>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_288px]">
        <div className="agenda-cal min-w-0 overflow-hidden rounded-xl border border-border bg-card">
          {data ? <EventCalendar options={calendarOptions} /> : <div className="flex h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
        </div>
        {data && (
          <div className="agenda-noprint">
            <SidePanel
              payload={data}
              version={version}
              readOnly={!canWrite}
              onOpen={setDrawerId}
              onChanged={refresh}
              onPickSlot={(s) => openBooking({ date: s.date, time: s.time, providerId: s.providerId, type: s.type })}
            />
          </div>
        )}
      </div>

      {/* Range selection: book or block */}
      {selectMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setSelectMenu(null)}>
          <div
            role="menu"
            className="absolute grid w-52 gap-1 rounded-xl border border-border bg-popover p-1.5 text-sm shadow-lg"
            style={{ left: selectMenu.x, top: selectMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-2 py-1 text-xs text-muted-foreground">{fmtDayShort(selectMenu.date)} · {selectMenu.start}–{selectMenu.end}</p>
            <button role="menuitem" className="rounded-md px-2 py-1.5 text-left hover:bg-muted" onClick={() => { openBooking({ date: selectMenu.date, time: selectMenu.start, providerId: selectMenu.providerId, durationMinutes: minutesBetween(`${selectMenu.date}T${selectMenu.start}`, `${selectMenu.date}T${selectMenu.end}`) }); setSelectMenu(null) }}>
              Book appointment here
            </button>
            <button role="menuitem" className="rounded-md px-2 py-1.5 text-left hover:bg-muted" onClick={() => { setBlockDraft({ mode: "create", date: selectMenu.date, start: selectMenu.start, end: selectMenu.end, providerId: selectMenu.providerId }); setSelectMenu(null) }}>
              Block this time
            </button>
          </div>
        </div>
      )}

      {/* Drag / resize confirmation */}
      {pendingMove && (
        <div role="dialog" aria-label="Confirm move" className="agenda-noprint fixed bottom-4 left-1/2 z-40 w-[min(560px,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-border bg-popover p-3 text-sm shadow-xl">
          <p>
            Move <strong>{pendingMove.appt.patientName}</strong> to <strong>{fmtDayShort(pendingMove.date)} {pendingMove.time}</strong>
            {pendingMove.duration !== pendingMove.appt.duration && <> ({pendingMove.duration} min)</>}
            {pendingMove.providerId !== pendingMove.appt.providerId && <> with <strong>{providers.find((p) => p.id === pendingMove.providerId)?.name ?? "no dentist"}</strong></>}?
          </p>
          {pendingMove.issues && (
            <ul className="mt-1.5 list-disc pl-5 text-amber-800 dark:text-amber-300">
              {pendingMove.issues.map((i, n) => <li key={n}>{ISSUE_LABEL[i.reason] ?? i.reason}{i.detail ? ` (${i.detail})` : ""}</li>)}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="mr-auto flex items-center gap-1.5">
              <input type="checkbox" checked={pendingMove.notify} onChange={(e) => setPendingMove({ ...pendingMove, notify: e.target.checked })} /> Tell the patient
            </label>
            <Button variant="ghost" size="sm" onClick={cancelMove}>Undo</Button>
            {pendingMove.issues && !pendingMove.conflict && (
              <Button size="sm" disabled={pendingMove.busy} onClick={() => confirmMove({ acknowledgeWarnings: true })}>Move anyway</Button>
            )}
            {pendingMove.conflict && canDoubleBook && (
              <Button size="sm" variant="outline" disabled={pendingMove.busy} onClick={() => confirmMove({ acknowledgeWarnings: true, allowOverlap: true })}>Double-book</Button>
            )}
            {!pendingMove.issues && (
              <Button size="sm" disabled={pendingMove.busy} onClick={() => confirmMove()}>{pendingMove.busy ? <Loader2 className="animate-spin" /> : "Confirm"}</Button>
            )}
          </div>
        </div>
      )}

      {data && (
        <>
          <BookingDialog
            draft={booking}
            payload={data}
            canDoubleBook={canDoubleBook}
            onClose={() => setBooking(null)}
            onDone={(msg) => {
              setBooking(null)
              setBookingFor(null)
              refresh(msg)
            }}
          />
          <AppointmentDrawer
            id={drawerId}
            payload={data}
            readOnly={!canWrite}
            onClose={() => setDrawerId(null)}
            onChanged={refresh}
            onMove={(d) => { setDrawerId(null); setBooking(d) }}
            onBookNext={(d) => { setDrawerId(null); setBooking(d) }}
          />
          <BlockDialog draft={blockDraft} payload={data} readOnly={!canWrite} onClose={() => setBlockDraft(null)} onDone={(msg) => { setBlockDraft(null); refresh(msg) }} />
        </>
      )}
    </div>
  )
}

const DAY_HEADER: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }
const WEEK_HEADER: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "numeric" }
const TIME_FMT: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false }
