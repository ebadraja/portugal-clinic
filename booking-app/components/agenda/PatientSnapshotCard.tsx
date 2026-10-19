"use client"

/** The patient at a glance while booking: alerts, last visit, what is already booked, latest note. */
import { useEffect, useState } from "react"
import { AlertTriangle, CalendarCheck, Clock, Loader2, Phone, StickyNote } from "lucide-react"
import type { AgendaPayload, PatientSnapshot } from "./types"
import { STATUS_LABEL } from "./strings"
import { fmtDayShort, fmtTime } from "./wall"

const ZAPPY_PREFIX = "Importado do Zappy: "

function monthYear(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(iso))
}

export function usePatientSnapshot(patientId: string | null, version = 0): PatientSnapshot | null {
  const [data, setData] = useState<{ id: string; snap: PatientSnapshot } | null>(null)
  useEffect(() => {
    if (!patientId) return
    const ctrl = new AbortController()
    fetch(`/api/agenda/patients/${patientId}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PatientSnapshot | null) => d && setData({ id: patientId, snap: d }))
      .catch(() => {})
    return () => ctrl.abort()
  }, [patientId, version])
  return data && data.id === patientId ? data.snap : null
}

export function PatientSnapshotCard({ snap, payload, excludeAppointmentId }: { snap: PatientSnapshot | null; payload: AgendaPayload; excludeAppointmentId?: string }) {
  if (!snap) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
  const typeLabel = (t: string) => payload.appointmentTypes.find((x) => x.type === t)?.label ?? t
  const upcoming = snap.upcoming.filter((u) => u.id !== excludeAppointmentId)
  const note = snap.notes[0]
  return (
    <div className="grid gap-1.5 text-xs">
      {snap.alerts.map((a) => (
        <p key={a.label} className="flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1 text-red-800 dark:bg-red-950/40 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span><strong>{a.label}</strong> — {a.source}</span>
        </p>
      ))}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
        {snap.phone ? <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{snap.phone}{snap.phoneNote ? ` (${snap.phoneNote})` : ""}</span> : <span className="text-amber-600">No phone on file</span>}
        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{snap.lastVisitAt ? `Last seen ${monthYear(snap.lastVisitAt)}` : "No visits on record"}</span>
        {snap.noShows > 0 && <span className="text-red-600">{snap.noShows} no-show{snap.noShows === 1 ? "" : "s"}</span>}
        {!snap.dateOfBirth && <span className="text-amber-600">Date of birth missing</span>}
      </div>
      {upcoming.length > 0 && (
        <div className="rounded-md bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="flex items-center gap-1.5 font-medium"><CalendarCheck className="h-3.5 w-3.5" /> Already booked</p>
          <ul className="mt-0.5 grid gap-0.5">
            {upcoming.map((u) => (
              <li key={u.id}>{fmtDayShort(u.start.slice(0, 10))} {fmtTime(u.start)} · {typeLabel(u.type)}{u.provider ? ` · ${u.provider}` : ""} <span className="opacity-70">({STATUS_LABEL[u.status] ?? u.status})</span></li>
            ))}
          </ul>
        </div>
      )}
      {snap.waitlist && (
        <p className="rounded-md bg-violet-50 px-2 py-1 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200">
          On the waiting list since {fmtDayShort(snap.waitlist.createdAt.slice(0, 10))}{snap.waitlist.notes ? ` — ${snap.waitlist.notes}` : ""}
        </p>
      )}
      {note && (
        <p className="flex items-start gap-1.5 text-muted-foreground">
          <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="line-clamp-2">{note.content.startsWith(ZAPPY_PREFIX) ? note.content.slice(ZAPPY_PREFIX.length) : note.content}</span>
        </p>
      )}
    </div>
  )
}
