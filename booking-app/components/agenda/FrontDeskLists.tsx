"use client"

/**
 * Who to call next, in one card: the waiting list (patients who want a sooner time), patients
 * due for a check-up, and the next free slots — each free slot shows who on the waiting list fits it.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { Hourglass, Loader2, Phone, Search, Stethoscope, X } from "lucide-react"
import { entryFitsSlot } from "@/lib/appointments/waitlistMatch"
import type { AgendaPayload, BookingDraft, WaitlistItem } from "./types"
import { fmtDayShort, fmtTime } from "./wall"

type Props = {
  payload: AgendaPayload
  version: number
  readOnly: boolean
  onBook: (draft: BookingDraft) => void
  onChanged: (message?: string) => void
}

type RecallRow = { id: string; name: string; phone: string | null; lastVisitAt: string | null; alerts: string[] }
type Slot = { date: string; time: string; providerId: string | null }
type Tab = "waitlist" | "recall" | "slots"

const selectCls = "h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none dark:bg-input/30"

const OUTCOMES = [
  { id: "no_answer", label: "No answer (try in a week)" },
  { id: "call_back", label: "Will call back (2 weeks)" },
  { id: "later", label: "Not now (3 months)" },
  { id: "declined", label: "Doesn't want one (1 year)" },
] as const

function monthYear(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(iso))
}

function tel(phone: string) {
  return `tel:${phone.replace(/\s+/g, "")}`
}

/** Booking draft for a waiting-list entry: moves their current appointment if they have one. */
export function draftForEntry(e: WaitlistItem, at: { date: string; time: string; providerId: string | null }, defaultType: string): BookingDraft {
  return {
    mode: e.currentAppointmentId ? "move" : "create",
    appointmentId: e.currentAppointmentId ?? undefined,
    patient: { id: e.patientId, name: e.patientName },
    date: at.date,
    time: at.time,
    providerId: at.providerId ?? e.providerId,
    type: e.type ?? defaultType,
    waitlistEntryId: e.id,
  }
}

export function FrontDeskLists({ payload, version, readOnly, onBook, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>("waitlist")
  const [entries, setEntries] = useState<WaitlistItem[] | null>(null)
  const [recall, setRecall] = useState<{ rows: RecallRow[]; total: number } | null>(null)
  const [recallVersion, setRecallVersion] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [logFor, setLogFor] = useState<string | null>(null)

  const [type, setType] = useState("EVALUATION")
  const [providerId, setProviderId] = useState("")
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [finding, setFinding] = useState(false)

  const types = payload.appointmentTypes.filter((t) => t.active)
  const providers = payload.providers.filter((p) => p.active)
  const typeLabel = (t: string) => payload.appointmentTypes.find((x) => x.type === t)?.label ?? t
  const providerName = (id: string | null) => providers.find((p) => p.id === id)?.name ?? null
  const durationOf = (t: string) => payload.appointmentTypes.find((x) => x.type === t)?.durationMinutes ?? null
  const checkupType = types.find((t) => t.type === "FOLLOW_UP")?.type ?? types.find((t) => t.type === "EVALUATION")?.type ?? types[0]?.type ?? "EVALUATION"

  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/agenda/waitlist", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((d) => setEntries(d.entries ?? []))
      .catch(() => {})
    return () => ctrl.abort()
  }, [version])

  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/patients/directory?recall=1&sort=lastVisit&limit=8", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { data: [], pagination: { total: 0 } }))
      .then((d) => setRecall({ rows: d.data ?? [], total: d.pagination?.total ?? 0 }))
      .catch(() => {})
    return () => ctrl.abort()
  }, [version, recallVersion])

  async function removeEntry(e: WaitlistItem) {
    setBusy(e.id)
    try {
      const res = await fetch(`/api/agenda/waitlist/${e.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "REMOVED" }) })
      if (res.ok) {
        setEntries((list) => list?.filter((x) => x.id !== e.id) ?? null)
        onChanged(`${e.patientName} taken off the waiting list.`)
      }
    } finally {
      setBusy(null)
    }
  }

  async function logCall(p: RecallRow, outcome: string) {
    setBusy(p.id)
    setLogFor(null)
    try {
      const res = await fetch(`/api/patients/${p.id}/recall`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ outcome }) })
      if (res.ok) {
        setRecallVersion((v) => v + 1)
        onChanged(`Call logged on ${p.name}'s record.`)
      }
    } finally {
      setBusy(null)
    }
  }

  async function findSlots() {
    setFinding(true)
    try {
      const params = new URLSearchParams({ type, limit: "8", ...(providerId && { providerId }) })
      const res = await fetch(`/api/agenda/free-slots?${params}`)
      const d = await res.json()
      setSlots(d.slots ?? [])
    } finally {
      setFinding(false)
    }
  }

  const fitsFor = (s: Slot) => (entries ?? []).filter((e) => entryFitsSlot(e, { ...s, durationMinutes: durationOf(type) ?? 30 }, durationOf))

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "waitlist", label: "Waiting list", count: entries?.length },
    { id: "recall", label: "Check-ups", count: recall?.total },
    ...(readOnly ? [] : [{ id: "slots" as const, label: "Free slots" }]),
  ]

  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <div role="tablist" aria-label="Call lists" className="mb-2 flex gap-1 rounded-lg bg-muted p-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-md px-1.5 py-1 text-xs font-medium ${tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}{t.count ? <span className="ml-1 tabular-nums opacity-70">{t.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === "waitlist" && (
        entries === null ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : entries.length === 0 ? (
          <p className="text-muted-foreground">
            Nobody is waiting. When a patient wants a sooner time, use <strong>Waiting list</strong> in the booking window — they show up here, and next to every time that frees up.
          </p>
        ) : (
          <ul className="grid gap-2">
            {entries.map((e) => (
              <li key={e.id} className="rounded-lg border border-border p-2">
                <div className="flex items-center gap-1.5">
                  <Hourglass className="h-3.5 w-3.5 shrink-0 text-violet-600" />
                  <Link href={`/patients/${e.patientId}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{e.patientName}</Link>
                  {e.alerts.length > 0 && <span title={e.alerts.join(", ")} className="rounded bg-red-100 px-1 text-[10px] font-bold text-red-700 dark:bg-red-950 dark:text-red-300">!</span>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {e.type ? typeLabel(e.type) : "Any appointment"} · {providerName(e.providerId) ?? "any dentist"} · {e.timeOfDay === "MORNING" ? "mornings" : e.timeOfDay === "AFTERNOON" ? "afternoons" : "any time"}
                  {e.untilDate ? ` · until ${fmtDayShort(e.untilDate)}` : ""}
                </p>
                {e.currentStart && <p className="text-xs text-amber-700 dark:text-amber-300">Booked {fmtDayShort(e.currentStart.slice(0, 10))} {fmtTime(e.currentStart)} — wants it sooner</p>}
                {e.notes && <p className="text-xs italic text-muted-foreground">{e.notes}</p>}
                <div className="mt-1.5 flex items-center gap-1">
                  {e.patientPhone && <a href={tel(e.patientPhone)} className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-xs hover:bg-muted"><Phone className="h-3 w-3" />Call</a>}
                  {!readOnly && (
                    <>
                      <button type="button" onClick={() => onBook(draftForEntry(e, { date: e.fromDate > payload.today ? e.fromDate : payload.today, time: e.timeOfDay === "AFTERNOON" ? "14:00" : "09:00", providerId: e.providerId }, checkupType))} className="rounded-md bg-blue-600 px-1.5 py-0.5 text-xs font-medium text-white hover:bg-blue-700">Find a time</button>
                      <button type="button" disabled={busy === e.id} onClick={() => removeEntry(e)} title="Take off the waiting list" aria-label={`Take ${e.patientName} off the waiting list`} className="ml-auto rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {tab === "recall" && (
        recall === null ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : recall.rows.length === 0 ? (
          <p className="text-muted-foreground">Nobody is due for a check-up call right now.</p>
        ) : (
          <>
            <p className="mb-1.5 text-xs text-muted-foreground">Due for a check-up and nothing booked. Most recent first — the likeliest to come back. Logging a call takes them off the list for a while and notes it on their record.</p>
            <ul className="grid gap-1.5">
              {recall.rows.map((p) => (
                <li key={p.id} className="rounded-lg border border-border p-2">
                  <div className="flex items-center gap-1.5">
                    <Stethoscope className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <Link href={`/patients/${p.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{p.name}</Link>
                    <span className="shrink-0 text-xs text-muted-foreground">{p.lastVisitAt ? monthYear(p.lastVisitAt) : ""}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {p.phone ? <a href={tel(p.phone)} className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-xs hover:bg-muted"><Phone className="h-3 w-3" />Call</a> : <span className="text-xs text-amber-600">No phone</span>}
                    {!readOnly && (
                      <>
                        <button type="button" onClick={() => onBook({ mode: "create", patient: { id: p.id, name: p.name }, date: payload.today, time: "09:00", providerId: null, type: checkupType })} className="rounded-md bg-blue-600 px-1.5 py-0.5 text-xs font-medium text-white hover:bg-blue-700">Book</button>
                        <div className="relative ml-auto">
                          <button type="button" disabled={busy === p.id} onClick={() => setLogFor(logFor === p.id ? null : p.id)} className="rounded-md border border-border px-1.5 py-0.5 text-xs hover:bg-muted">
                            {busy === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Log call ▾"}
                          </button>
                          {logFor === p.id && (
                            <div role="menu" className="absolute right-0 z-20 mt-1 grid w-52 gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-lg">
                              {OUTCOMES.map((o) => (
                                <button key={o.id} role="menuitem" type="button" onClick={() => logCall(p, o.id)} className="rounded-md px-2 py-1 text-left text-xs hover:bg-muted">{o.label}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {recall.total > recall.rows.length && (
              <Link href="/patients" className="mt-2 block text-xs text-blue-700 hover:underline dark:text-blue-300">
                {recall.total - recall.rows.length} more — Patients → “Due for a check-up”
              </Link>
            )}
          </>
        )
      )}

      {tab === "slots" && !readOnly && (
        <>
          <div className="grid gap-1.5">
            <select className={selectCls} value={type} onChange={(e) => { setType(e.target.value); setSlots(null) }} aria-label="Appointment type">
              {types.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
            </select>
            {providers.length > 1 && (
              <select className={selectCls} value={providerId} onChange={(e) => { setProviderId(e.target.value); setSlots(null) }} aria-label="Dentist">
                <option value="">Any dentist</option>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <button type="button" onClick={findSlots} disabled={finding} className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-blue-600 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60">
              {finding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Find
            </button>
          </div>
          {slots && (
            slots.length === 0 ? (
              <p className="mt-2 text-muted-foreground">No free {typeLabel(type).toLowerCase()} slots in the booking horizon.</p>
            ) : (
              <ul className="mt-2 grid gap-1">
                {slots.map((s) => {
                  const fits = fitsFor(s)
                  return (
                    <li key={`${s.date}${s.time}${s.providerId}`} className="flex items-center gap-1">
                      <button type="button" onClick={() => onBook({ mode: "create", date: s.date, time: s.time, providerId: s.providerId, type })} className="flex min-w-0 flex-1 justify-between rounded-md px-1.5 py-1 text-left tabular-nums hover:bg-muted">
                        <span>{fmtDayShort(s.date)} · {s.time}</span>
                        {s.providerId && providers.length > 1 && <span className="truncate pl-1 text-muted-foreground">{providerName(s.providerId)}</span>}
                      </button>
                      {fits.length > 0 && (
                        <button
                          type="button"
                          title={`On the waiting list and fits: ${fits.map((f) => f.patientName).join(", ")}`}
                          onClick={() => onBook(draftForEntry(fits[0], s, type))}
                          className="flex shrink-0 items-center gap-0.5 rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-800 hover:bg-violet-200 dark:bg-violet-950 dark:text-violet-200"
                        >
                          <Hourglass className="h-3 w-3" />{fits[0].patientName.split(" ")[0]}{fits.length > 1 ? ` +${fits.length - 1}` : ""}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )
          )}
        </>
      )}
    </section>
  )
}
