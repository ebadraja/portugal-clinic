"use client"

import { useEffect, useState } from "react"
import { Check, Loader2, Phone, Search, UserCheck } from "lucide-react"
import type { AgendaAppointment, AgendaPayload } from "./types"
import { STATUS_LABEL } from "./strings"
import { addDays, fmtDayShort, fmtTime } from "./wall"

type Props = {
  payload: AgendaPayload
  version: number
  readOnly: boolean
  onOpen: (id: string) => void
  onPickSlot: (slot: { date: string; time: string; providerId: string | null; type: string }) => void
  onChanged: (message?: string) => void
}

/** Minutes since midnight in the clinic's time zone (not the browser's). */
function clinicMinutes(timeZone: string): number {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":").map(Number)
  return h * 60 + m
}

const selectCls = "h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none dark:bg-input/30"

export function SidePanel({ payload, version, readOnly, onOpen, onPickSlot, onChanged }: Props) {
  const today = payload.today
  const tomorrow = addDays(today, 1)
  const [days, setDays] = useState<AgendaAppointment[] | null>(null)
  const [nowMinutes, setNowMinutes] = useState(() => clinicMinutes(payload.timezone))
  const [busy, setBusy] = useState<string | null>(null)

  const [type, setType] = useState("EVALUATION")
  const [providerId, setProviderId] = useState("")
  const [slots, setSlots] = useState<{ date: string; time: string; providerId: string | null }[] | null>(null)
  const [finding, setFinding] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`/api/agenda?from=${today}&to=${tomorrow}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => setDays(d.appointments ?? []))
      .catch(() => {})
    return () => ctrl.abort()
  }, [today, tomorrow, version])

  useEffect(() => {
    const t = setInterval(() => setNowMinutes(clinicMinutes(payload.timezone)), 60_000)
    return () => clearInterval(t)
  }, [payload.timezone])

  async function quick(id: string, body: Record<string, unknown>, done: string) {
    setBusy(id)
    try {
      const res = await fetch(`/api/agenda/appointments/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      if (res.ok) onChanged(done)
      else onChanged((await res.json().catch(() => ({}))).error ?? "Could not update")
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

  const live = (a: AgendaAppointment) => a.status === "SCHEDULED" || a.status === "CONFIRMED" || a.status === "COMPLETED"
  const todayList = (days ?? []).filter((a) => a.start.startsWith(today) && live(a))
  const toClose = todayList.filter((a) => (a.status === "SCHEDULED" || a.status === "CONFIRMED") && a.end.slice(0, 10) === today && Number(a.end.slice(11, 13)) * 60 + Number(a.end.slice(14, 16)) < nowMinutes)
  const unconfirmed = (days ?? []).filter((a) => a.start.startsWith(tomorrow) && a.status === "SCHEDULED")
  const typeLabel = (t: string) => payload.appointmentTypes.find((x) => x.type === t)?.label ?? t

  return (
    <aside className="grid content-start gap-4 text-sm" aria-label="Front desk">
      <section className="rounded-xl border border-border bg-card p-3">
        <h2 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Today <span className="font-normal normal-case">{todayList.length} appointment{todayList.length === 1 ? "" : "s"}</span>
        </h2>
        {days === null ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : todayList.length === 0 ? (
          <p className="text-muted-foreground">Nothing booked today.</p>
        ) : (
          <ul className="grid gap-1">
            {todayList.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <button type="button" onClick={() => onOpen(a.id)} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted">
                  <span className="w-11 shrink-0 tabular-nums text-muted-foreground">{fmtTime(a.start)}</span>
                  <span className={`truncate ${a.status === "COMPLETED" ? "text-muted-foreground line-through" : ""}`}>{a.patientName}</span>
                  {a.checkedInAt && a.status !== "COMPLETED" && <span className="rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">IN</span>}
                </button>
                {!readOnly && !a.checkedInAt && a.status !== "COMPLETED" && (
                  <button type="button" title="Mark as arrived" aria-label={`${a.patientName} arrived`} disabled={busy === a.id} onClick={() => quick(a.id, { action: "checkin", arrived: true }, `${a.patientName} arrived.`)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                    {busy === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!readOnly && toClose.length > 0 && (
          <div className="mt-3 rounded-lg bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="mb-1.5 font-medium">{toClose.length} past appointment{toClose.length === 1 ? "" : "s"} still open</p>
            <ul className="grid gap-1">
              {toClose.map((a) => (
                <li key={a.id} className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate">{fmtTime(a.start)} {a.patientName}</span>
                  <button type="button" disabled={busy === a.id} onClick={() => quick(a.id, { action: "status", status: "COMPLETED" }, "Completed.")} className="rounded bg-white/70 px-1.5 py-0.5 text-xs hover:bg-white dark:bg-slate-900/60">Done</button>
                  <button type="button" disabled={busy === a.id} onClick={() => quick(a.id, { action: "status", status: "NO_SHOW" }, "Marked as no-show.")} className="rounded bg-white/70 px-1.5 py-0.5 text-xs hover:bg-white dark:bg-slate-900/60">No-show</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Not confirmed for tomorrow</h2>
        {days === null ? null : unconfirmed.length === 0 ? (
          <p className="text-muted-foreground">Everyone tomorrow has confirmed.</p>
        ) : (
          <ul className="grid gap-1">
            {unconfirmed.map((a) => (
              <li key={a.id} className="flex items-center gap-1.5">
                <button type="button" onClick={() => onOpen(a.id)} className="min-w-0 flex-1 truncate rounded-md px-1 py-1 text-left hover:bg-muted">
                  <span className="tabular-nums text-muted-foreground">{fmtTime(a.start)}</span> {a.patientName}
                </button>
                {a.patientPhone && (
                  <a href={`tel:${a.patientPhone.replace(/\s+/g, "")}`} title="Call" aria-label={`Call ${a.patientName}`} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Phone className="h-4 w-4" /></a>
                )}
                {!readOnly && (
                  <button type="button" title="Confirmed by phone" aria-label={`${a.patientName} confirmed`} disabled={busy === a.id} onClick={() => quick(a.id, { action: "status", status: "CONFIRMED", via: "phone" }, "Confirmed.")} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Check className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!readOnly && (
        <section className="rounded-xl border border-border bg-card p-3">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next free slots</h2>
          <div className="grid gap-1.5">
            <select className={selectCls} value={type} onChange={(e) => { setType(e.target.value); setSlots(null) }} aria-label="Appointment type">
              {payload.appointmentTypes.filter((t) => t.active).map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
            </select>
            {payload.providers.filter((p) => p.active).length > 1 && (
              <select className={selectCls} value={providerId} onChange={(e) => { setProviderId(e.target.value); setSlots(null) }} aria-label="Dentist">
                <option value="">Any dentist</option>
                {payload.providers.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                {slots.map((s) => (
                  <li key={`${s.date}${s.time}${s.providerId}`}>
                    <button type="button" onClick={() => onPickSlot({ ...s, type })} className="flex w-full justify-between rounded-md px-1.5 py-1 text-left tabular-nums hover:bg-muted">
                      <span>{fmtDayShort(s.date)} · {s.time}</span>
                      {s.providerId && payload.providers.filter((p) => p.active).length > 1 && <span className="text-muted-foreground">{payload.providers.find((p) => p.id === s.providerId)?.name}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
        </section>
      )}

      <p className="px-1 text-xs text-muted-foreground">
        Status legend: {Object.entries(STATUS_LABEL).filter(([k]) => k !== "RESCHEDULED").map(([, v]) => v).join(" · ")}
      </p>
    </aside>
  )
}
