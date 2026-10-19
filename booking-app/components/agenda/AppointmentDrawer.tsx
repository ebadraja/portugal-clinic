"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle, Bell, CalendarClock, CalendarPlus, Check, CheckCheck, FileText, Loader2, Mail, MessageSquare,
  Phone, PhoneCall, Printer, UserCheck, UserX, X,
} from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button, buttonVariants } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { AgendaPayload, AppointmentDetail, BookingDraft } from "./types"
import { ACTOR_LABEL, EVENT_LABEL, NOTIFICATION_LABEL, SOURCE_LABEL, STATUS_LABEL } from "./strings"
import { fmtDayLong, fmtTime } from "./wall"

type Props = {
  id: string | null
  payload: AgendaPayload
  readOnly: boolean
  onClose: () => void
  onChanged: (message?: string) => void
  onMove: (draft: BookingDraft) => void
  onBookNext: (draft: BookingDraft) => void
}

const STEPS = ["SCHEDULED", "CONFIRMED", "ARRIVED", "COMPLETED"] as const

function when(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
}

export function AppointmentDrawer(props: Props) {
  return (
    <Sheet open={props.id !== null} onOpenChange={(o) => !o && props.onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {props.id && <DrawerBody key={props.id} {...props} id={props.id} />}
      </SheetContent>
    </Sheet>
  )
}

function DrawerBody({ id, payload, readOnly, onChanged, onMove, onBookNext }: Props & { id: string }) {
  const [detail, setDetail] = useState<AppointmentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [notifyCancel, setNotifyCancel] = useState(true)
  const [notes, setNotes] = useState("")
  const [notesDirty, setNotesDirty] = useState(false)

  const load = useCallback(async (appointmentId: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/agenda/appointments/${appointmentId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to load")
      setDetail(data)
      setNotes(data.notes ?? "")
      setNotesDirty(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`/api/agenda/appointments/${id}`, { signal: ctrl.signal })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Failed to load")
        setDetail(data)
        setNotes(data.notes ?? "")
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message)
      })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [id])

  async function patch(body: Record<string, unknown>, label: string, done: string) {
    if (!detail) return
    setBusy(label)
    setError(null)
    try {
      const res = await fetch(`/api/agenda/appointments/${detail.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 422 || res.status === 409) {
        setError(`${data.error ?? "Not possible"} — use Move to pick another time.`)
        return
      }
      if (!res.ok) throw new Error(data.error ?? "Failed")
      await load(detail.id)
      onChanged(done)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const typeLabel = (t: string) => payload.appointmentTypes.find((x) => x.type === t)?.label ?? t
  const d = detail
  const active = d && (d.status === "SCHEDULED" || d.status === "CONFIRMED")
  const stepIndex = !d ? -1 : d.status === "COMPLETED" ? 3 : d.checkedInAt ? 2 : d.status === "CONFIRMED" ? 1 : d.status === "SCHEDULED" ? 0 : -1

  return (
    <>
        {loading && !d && (
          <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        )}
        {d && (
          <>
            <SheetHeader className="gap-1 pb-0">
              <SheetTitle className="pr-8 text-lg">
                <Link href={`/patients/${d.patient.id}`} className="hover:underline">{d.patient.name}</Link>
              </SheetTitle>
              <SheetDescription className="text-sm">
                {fmtDayLong(d.start.slice(0, 10))} · {fmtTime(d.start)}–{fmtTime(d.end)}
              </SheetDescription>
            </SheetHeader>

            <div className="grid gap-5 px-4 pb-6">
              {/* Facts */}
              <div className="grid gap-1 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md px-1.5 py-0.5 text-xs font-medium text-white" style={{ background: payload.appointmentTypes.find((t) => t.type === d.type)?.color ?? "#64748b" }}>{typeLabel(d.type)}</span>
                  <span className="text-muted-foreground">with {d.provider ?? "no dentist set"}</span>
                  <span className="text-muted-foreground">· {d.duration} min</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                  <span>{SOURCE_LABEL[d.bookedVia] ?? d.bookedVia}{d.createdBy ? ` · ${d.createdBy}` : ""}</span>
                  {d.seriesId && <span>· part of a series</span>}
                  {d.allowedOverlap && <span className="text-amber-600">· double-booked</span>}
                </div>
              </div>

              {/* Contact + alerts */}
              <div className="grid gap-2 rounded-xl border border-border p-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  {d.patient.phone ? (
                    <a href={`tel:${d.patient.phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 hover:bg-muted/70">
                      <Phone className="h-4 w-4" /> {d.patient.phone}
                    </a>
                  ) : (
                    <span className="text-amber-600">No phone on file</span>
                  )}
                  {d.patient.email && (
                    <a href={`mailto:${d.patient.email}`} className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 hover:bg-muted/70">
                      <Mail className="h-4 w-4" /> Email
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                  <span>{d.patient.totalVisits} visit{d.patient.totalVisits === 1 ? "" : "s"}</span>
                  {d.patient.noShows > 0 && <span className="text-red-600">{d.patient.noShows} no-show{d.patient.noShows === 1 ? "" : "s"}</span>}
                  {!d.patient.smsRemindersEnabled && <span>SMS reminders off</span>}
                  {d.patient.importedFrom && <span>from {d.patient.importedFrom}</span>}
                </div>
                {d.patient.allergies && (
                  <p className="flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-red-800 dark:bg-red-950/40 dark:text-red-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Allergies: {d.patient.allergies}
                  </p>
                )}
                {!d.patient.dateOfBirth && (
                  <p className="rounded-md bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Date of birth missing — confirm it at this visit.</p>
                )}
              </div>

              {/* Status */}
              {stepIndex >= 0 ? (
                <ol className="grid grid-cols-4 gap-1" aria-label="Progress">
                  {STEPS.map((s, i) => (
                    <li key={s} className={`rounded-md px-1 py-1.5 text-center text-xs font-medium ${i <= stepIndex ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"}`}>
                      {s === "ARRIVED" ? "Arrived" : STATUS_LABEL[s]}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                  <span className="font-medium">{STATUS_LABEL[d.status]}</span>
                  {d.cancelReason ? ` — ${d.cancelReason}` : ""}
                </p>
              )}

              {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p>}

              {!readOnly && (
                <div className="grid gap-2">
                  {active && (
                    <div className="grid grid-cols-2 gap-2">
                      {d.status === "SCHEDULED" && (
                        <Button variant="outline" disabled={!!busy} onClick={() => patch({ action: "status", status: "CONFIRMED", via: "phone" }, "confirm", "Confirmed.")}>
                          {busy === "confirm" ? <Loader2 className="animate-spin" /> : <Check />} Confirmed
                        </Button>
                      )}
                      <Button variant="outline" disabled={!!busy} onClick={() => patch({ action: "checkin", arrived: !d.checkedInAt }, "checkin", d.checkedInAt ? "Arrival undone." : "Marked as arrived.")}>
                        {busy === "checkin" ? <Loader2 className="animate-spin" /> : <UserCheck />} {d.checkedInAt ? "Undo arrival" : "Arrived"}
                      </Button>
                      <Button variant="outline" disabled={!!busy} onClick={() => patch({ action: "status", status: "COMPLETED" }, "complete", "Completed.")}>
                        {busy === "complete" ? <Loader2 className="animate-spin" /> : <CheckCheck />} Completed
                      </Button>
                      <Button variant="outline" disabled={!!busy} onClick={() => patch({ action: "status", status: "NO_SHOW" }, "noshow", "Marked as no-show.")}>
                        {busy === "noshow" ? <Loader2 className="animate-spin" /> : <UserX />} No-show
                      </Button>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {(active || d.status === "CANCELLED" || d.status === "NO_SHOW") && (
                      <Button
                        variant="outline"
                        onClick={() => onMove({ mode: "move", appointmentId: d.id, patient: { id: d.patient.id, name: d.patient.name }, date: d.start.slice(0, 10), time: fmtTime(d.start), providerId: d.providerId, type: d.type, durationMinutes: d.duration })}
                      >
                        <CalendarClock /> Move
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => onBookNext({ mode: "create", patient: { id: d.patient.id, name: d.patient.name }, date: d.start.slice(0, 10), time: fmtTime(d.start), providerId: d.providerId, type: d.type })}
                    >
                      <CalendarPlus /> Book next visit
                    </Button>
                    {d.status !== "CANCELLED" && d.status !== "COMPLETED" && !cancelling && (
                      <Button variant="destructive" onClick={() => setCancelling(true)}>
                        <X /> Cancel appointment
                      </Button>
                    )}
                    {(d.status === "COMPLETED" || d.checkedInAt) && (
                      <a href={`/print/appointments/${d.id}/certificate`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
                        <Printer /> Attendance certificate
                      </a>
                    )}
                    {(d.status === "CANCELLED" || d.status === "NO_SHOW") && (
                      <Button variant="outline" disabled={!!busy} onClick={() => patch({ action: "status", status: "SCHEDULED", acknowledgeWarnings: true }, "reopen", "Appointment restored.")}>
                        Restore
                      </Button>
                    )}
                  </div>
                  {cancelling && (
                    <div className="grid gap-2 rounded-xl border border-red-200 bg-red-50/60 p-3 dark:border-red-900 dark:bg-red-950/30">
                      <Textarea rows={2} placeholder="Reason (e.g. patient called, dentist ill)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} autoFocus />
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={notifyCancel} onChange={(e) => setNotifyCancel(e.target.checked)} /> Tell the patient (SMS/email)
                      </label>
                      <div className="flex gap-2">
                        <Button variant="destructive" disabled={!!busy} onClick={() => patch({ action: "status", status: "CANCELLED", reason: cancelReason.trim() || null, notifyPatient: notifyCancel }, "cancel", "Appointment cancelled.")}>
                          {busy === "cancel" ? <Loader2 className="animate-spin" /> : null} Cancel it
                        </Button>
                        <Button variant="ghost" onClick={() => setCancelling(false)}>Keep</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Notes */}
              <div className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</span>
                <Textarea rows={3} value={notes} readOnly={readOnly} onChange={(e) => { setNotes(e.target.value); setNotesDirty(true) }} placeholder="Internal notes for this appointment" />
                {notesDirty && !readOnly && (
                  <Button size="sm" className="justify-self-end" disabled={!!busy} onClick={() => patch({ action: "details", notes: notes.trim() || null }, "notes", "Notes saved.")}>
                    Save notes
                  </Button>
                )}
              </div>

              {d.callLog && (
                <div className="grid gap-1 rounded-xl border border-border p-3 text-sm">
                  <span className="flex items-center gap-1.5 font-medium"><PhoneCall className="h-4 w-4" /> Booked on a call with Acácia · {when(d.callLog.at)}</span>
                  {d.callLog.summary && <p className="text-muted-foreground">{d.callLog.summary}</p>}
                  <Link href={`/call-logs?call=${d.callLog.id}`} className="text-blue-700 hover:underline dark:text-blue-300">Open call{d.callLog.hasRecording ? " and recording" : ""}</Link>
                </div>
              )}

              {/* Messages */}
              <div className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Messages to the patient</span>
                {d.notifications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None planned.</p>
                ) : (
                  <ul className="grid gap-1 text-sm">
                    {d.notifications.map((n) => {
                      const tone = n.status === "FAILED" || n.deliveryStatus === "failed" || n.deliveryStatus === "undelivered" ? "text-red-600" : n.deliveryStatus === "delivered" ? "text-emerald-600" : n.status === "SENT" ? "text-blue-600" : "text-muted-foreground"
                      const state = n.deliveryStatus ?? n.status.toLowerCase()
                      return (
                        <li key={n.id} className="flex items-start gap-2">
                          {n.channel === "SMS" ? <MessageSquare className={`mt-0.5 h-4 w-4 ${tone}`} /> : <Mail className={`mt-0.5 h-4 w-4 ${tone}`} />}
                          <span className="flex-1">
                            {NOTIFICATION_LABEL[n.kind] ?? n.kind} <span className="text-muted-foreground">· {n.sentAt ? when(n.sentAt) : `planned ${when(n.sendAt)}`}</span>
                            <span className={`ml-1 ${tone}`}>({state})</span>
                            {n.error && n.status !== "SENT" && <span className="block text-xs text-muted-foreground">{n.error}</span>}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {/* History */}
              <div className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</span>
                <ul className="grid gap-1.5 border-l border-border pl-3 text-sm">
                  {d.events.filter((e) => !e.kind.startsWith("NOTIFICATION")).map((e) => {
                    const data = e.data ?? {}
                    const extra = e.kind === "RESCHEDULED" && typeof data.from === "string" && typeof data.to === "string"
                      ? ` ${when(data.from)} → ${when(data.to)}`
                      : typeof data.reason === "string" && data.reason ? ` — ${data.reason}` : ""
                    return (
                      <li key={e.id}>
                        <span className="font-medium">{EVENT_LABEL[e.kind] ?? e.kind}</span>
                        <span className="text-muted-foreground">{extra} · {e.by ?? ACTOR_LABEL[e.actor] ?? e.actor} · {when(e.at)}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>

              {d.upcoming.length > 0 && (
                <div className="grid gap-1 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Other upcoming</span>
                  {d.upcoming.map((u) => (
                    <span key={u.id} className="flex items-center gap-1.5 text-muted-foreground"><Bell className="h-3.5 w-3.5" /> {fmtDayLong(u.start.slice(0, 10))} {fmtTime(u.start)} · {typeLabel(u.type)}</span>
                  ))}
                </div>
              )}

              <Link href={`/patients/${d.patient.id}`} className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline dark:text-blue-300">
                <FileText className="h-4 w-4" /> Open patient record
              </Link>
            </div>
          </>
        )}
        {error && !d && <p className="p-4 text-sm text-red-600">{error}</p>}
    </>
  )
}
