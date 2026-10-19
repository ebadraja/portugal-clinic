"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Hourglass, Loader2, Search, UserPlus, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { AgendaPayload, BookingDraft, Issue, PatientHit } from "./types"
import { ISSUE_LABEL } from "./strings"
import { fmtDayShort } from "./wall"
import { PatientSnapshotCard, usePatientSnapshot } from "./PatientSnapshotCard"
import { WaitlistForm } from "./WaitlistForm"

type Props = {
  draft: BookingDraft | null
  payload: AgendaPayload
  canDoubleBook: boolean
  onClose: () => void
  onDone: (message: string) => void
}

type Problem = { kind: "warnings" | "conflict" | "error"; message: string; issues: Issue[] }

const selectCls = "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

let draftSeq = 0
const draftKeys = new WeakMap<BookingDraft, number>()
function keyOf(d: BookingDraft): number {
  if (!draftKeys.has(d)) draftKeys.set(d, ++draftSeq)
  return draftKeys.get(d)!
}

/** A fresh form for every opened draft (no state carried between bookings). */
export function BookingDialog(props: Props) {
  if (!props.draft) return null
  return <BookingForm key={keyOf(props.draft)} {...props} draft={props.draft} />
}

function BookingForm({ draft, payload, canDoubleBook, onClose, onDone }: Props & { draft: BookingDraft }) {
  const open = true
  const types = useMemo(() => payload.appointmentTypes.filter((t) => t.active), [payload.appointmentTypes])
  const providers = useMemo(() => payload.providers.filter((p) => p.active), [payload.providers])
  const initialType = draft.type ?? (types.find((x) => x.type === "EVALUATION") ?? types[0])?.type ?? "EVALUATION"

  const [patient, setPatient] = useState<{ id: string; name: string } | null>(draft.patient ?? null)
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<PatientHit[]>([])
  const [searching, setSearching] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newP, setNewP] = useState({ firstName: "", lastName: "", phone: "", dateOfBirth: "", email: "" })

  const [type, setType] = useState(initialType)
  const initialProvider = draft.providerId && draft.providerId !== "__none" ? draft.providerId : providers.length === 1 ? providers[0].id : ""
  const [pickedProvider, setPickedProvider] = useState<string>(initialProvider)
  // Until someone picks a dentist, the patient's usual dentist is suggested.
  const [providerTouched, setProviderTouched] = useState(!!initialProvider)
  const setProviderId = (id: string) => {
    setProviderTouched(true)
    setPickedProvider(id)
  }
  const [date, setDate] = useState(draft.date)
  const [time, setTime] = useState(draft.time)
  const [duration, setDuration] = useState(draft.durationMinutes ?? types.find((x) => x.type === initialType)?.durationMinutes ?? 30)
  const [notes, setNotes] = useState(draft.notes ?? "")
  const [notify, setNotify] = useState(true)
  const [repeat, setRepeat] = useState(false)
  const [everyWeeks, setEveryWeeks] = useState(4)
  const [count, setCount] = useState(6)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [suggestions, setSuggestions] = useState<{ date: string; time: string; providerId: string | null }[]>([])
  const [waitlisting, setWaitlisting] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const snap = usePatientSnapshot(patient?.id ?? null)
  const usual = !providerTouched && snap?.preferredProviderId && providers.some((p) => p.id === snap.preferredProviderId) ? snap.preferredProviderId : null
  const providerId = usual ?? pickedProvider

  useEffect(() => {
    if (draft.patient) return
    const t = setTimeout(() => searchRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [draft.patient])

  // Patient search (debounced). Results only show while they match the current query.
  const searchable = !patient && query.trim().length >= 2
  const visibleHits = searchable ? hits : []
  useEffect(() => {
    if (!searchable) return
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/agenda/patients?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        const data = await res.json()
        setHits(data.patients ?? [])
      } catch {
        /* aborted */
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [query, searchable])

  // Next free slots for the chosen type/dentist.
  useEffect(() => {
    if (!open || !date) return
    const ctrl = new AbortController()
    const params = new URLSearchParams({ type, from: date, limit: "6", ...(providerId && { providerId }) })
    fetch(`/api/agenda/free-slots?${params}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => setSuggestions(d.slots ?? []))
      .catch(() => {})
    return () => ctrl.abort()
  }, [open, type, providerId, date])

  const providerChoices = providers.filter((p) => p.appointmentTypes.length === 0 || p.appointmentTypes.includes(type))

  function chooseType(t: string) {
    setType(t)
    const cfg = types.find((x) => x.type === t)
    if (cfg && draft?.mode === "create") setDuration(cfg.durationMinutes)
  }

  async function createPatient(): Promise<{ id: string; name: string } | null> {
    const res = await fetch("/api/patients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: newP.firstName.trim(),
        lastName: newP.lastName.trim(),
        phone: newP.phone.trim(),
        email: newP.email.trim() || undefined,
        dateOfBirth: newP.dateOfBirth || undefined,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setProblem({ kind: "error", message: data.error ?? "Could not create the patient", issues: [] })
      return null
    }
    return { id: data.id, name: `${data.firstName} ${data.lastName}` }
  }

  async function submit(opts: { acknowledgeWarnings?: boolean; allowOverlap?: boolean } = {}) {
    setBusy(true)
    setProblem(null)
    try {
      let p = patient
      if (!p && draft?.mode === "create") {
        if (!creating) {
          setProblem({ kind: "error", message: "Choose a patient or create a new one.", issues: [] })
          return
        }
        if (!newP.firstName.trim() || !newP.lastName.trim() || !newP.phone.trim()) {
          setProblem({ kind: "error", message: "New patient: first name, last name and phone are required.", issues: [] })
          return
        }
        p = await createPatient()
        if (!p) return
        setPatient(p)
        setCreating(false)
      }
      const common = {
        date,
        time,
        durationMinutes: duration,
        providerId: providerId || null,
        notifyPatient: notify,
        ...opts,
      }
      const res =
        draft?.mode === "move"
          ? await fetch(`/api/agenda/appointments/${draft.appointmentId}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "move", type, ...common, ...(draft.waitlistEntryId && { waitlistEntryId: draft.waitlistEntryId }) }),
            })
          : await fetch("/api/agenda/appointments", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ patientId: p!.id, type, notes: notes.trim() || null, ...common, ...(repeat && { repeat: { everyWeeks, count } }), ...(draft.waitlistEntryId && { waitlistEntryId: draft.waitlistEntryId }) }),
            })
      const data = await res.json().catch(() => ({}))
      if (res.status === 422) {
        setProblem({ kind: "warnings", message: "Please confirm:", issues: data.issues ?? [] })
        return
      }
      if (res.status === 409) {
        setProblem({ kind: "conflict", message: data.error ?? "That time is taken.", issues: data.issues ?? [] })
        return
      }
      if (!res.ok) {
        setProblem({ kind: "error", message: data.error ?? "Something went wrong.", issues: [] })
        return
      }
      if (data.skipped?.length) {
        onDone(`Series booked: ${data.created.length} appointments. Skipped (taken): ${data.skipped.map((s: { date: string }) => fmtDayShort(s.date)).join(", ")}.`)
      } else {
        onDone(draft?.mode === "move" ? "Appointment moved." : `Booked ${p?.name ?? ""} — ${fmtDayShort(date)} ${time}.`)
      }
    } finally {
      setBusy(false)
    }
  }

  const title = draft.mode === "move" ? "Move appointment" : "New appointment"

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {fmtDayShort(date || draft.date)} · {time || draft.time}
            {draft.waitlistEntryId && <span className="ml-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-800 dark:bg-violet-950 dark:text-violet-200">from the waiting list</span>}
          </DialogDescription>
        </DialogHeader>

        {waitlisting && patient ? (
          <WaitlistForm
            payload={payload}
            patient={patient}
            type={type}
            providerId={providerId || null}
            current={draft.mode === "move" && draft.appointmentId ? { id: draft.appointmentId, start: `${draft.date}T${draft.time}` } : null}
            onCancel={() => setWaitlisting(false)}
            onDone={onDone}
          />
        ) : (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          {/* Patient */}
          <div className="grid gap-1.5">
            <Label>Patient</Label>
            {patient ? (
              <div className="grid gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{patient.name}</span>
                  {draft.mode === "create" && !draft.waitlistEntryId && (
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Change patient" onClick={() => setPatient(null)}>
                      <X />
                    </Button>
                  )}
                </div>
                <PatientSnapshotCard snap={snap} payload={payload} excludeAppointmentId={draft.appointmentId} />
              </div>
            ) : creating ? (
              <div className="grid gap-2 rounded-lg border border-border p-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="First name" value={newP.firstName} onChange={(e) => setNewP({ ...newP, firstName: e.target.value })} autoFocus />
                  <Input placeholder="Last name(s)" value={newP.lastName} onChange={(e) => setNewP({ ...newP, lastName: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Phone (912 345 678)" inputMode="tel" value={newP.phone} onChange={(e) => setNewP({ ...newP, phone: e.target.value })} />
                  <Input type="date" aria-label="Date of birth (optional)" value={newP.dateOfBirth} onChange={(e) => setNewP({ ...newP, dateOfBirth: e.target.value })} />
                </div>
                <Input placeholder="Email (optional)" type="email" value={newP.email} onChange={(e) => setNewP({ ...newP, email: e.target.value })} />
                <button type="button" className="justify-self-start text-xs text-muted-foreground underline" onClick={() => setCreating(false)}>
                  Search existing patients instead
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input ref={searchRef} className="pl-8" placeholder="Name, phone or NIF" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search patients" />
                {searching && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                {searchable && (
                  <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-sm" role="listbox">
                    {visibleHits.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted"
                          onClick={() => setPatient({ id: h.id, name: h.name })}
                        >
                          <span>
                            <span className="font-medium">{h.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{h.phone ?? "no phone"}</span>
                            {h.alerts.length > 0 && <span title={h.alerts.join(", ")} className="ml-1.5 rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">{h.alerts[0]}{h.alerts.length > 1 ? ` +${h.alerts.length - 1}` : ""}</span>}
                          </span>
                          <span className="text-xs text-muted-foreground">{h.dateOfBirth ? h.dateOfBirth.split("-").reverse().join("/") : "DOB missing"}</span>
                        </button>
                      </li>
                    ))}
                    <li>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-blue-700 hover:bg-muted dark:text-blue-300"
                        onClick={() => {
                          const [first, ...rest] = query.trim().split(/\s+/)
                          const digits = query.replace(/\D/g, "")
                          setNewP({ ...newP, firstName: digits.length >= 6 ? "" : first ?? "", lastName: digits.length >= 6 ? "" : rest.join(" "), phone: digits.length >= 6 ? query.trim() : "" })
                          setCreating(true)
                        }}
                      >
                        <UserPlus className="h-4 w-4" /> New patient{query.trim() ? `: “${query.trim()}”` : ""}
                      </button>
                    </li>
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* What & who */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bk-type">Type</Label>
              <select id="bk-type" className={selectCls} value={type} onChange={(e) => chooseType(e.target.value)}>
                {types.map((t) => (
                  <option key={t.type} value={t.type}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bk-provider">Dentist{usual && <span className="font-normal text-muted-foreground"> · their usual</span>}</Label>
              <select id="bk-provider" className={selectCls} value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                {providers.length !== 1 && <option value="">First available</option>}
                {providerChoices.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* When */}
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bk-date">Date</Label>
              <Input id="bk-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bk-time">Time</Label>
              <Input id="bk-time" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bk-dur">Minutes</Label>
              <Input id="bk-dur" type="number" min={5} max={720} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 30)} />
            </div>
          </div>

          {suggestions.length > 0 && (
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Next free</span>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => {
                  const active = s.date === date && s.time === time && (!providerId || s.providerId === providerId)
                  return (
                    <button
                      key={`${s.date}${s.time}${s.providerId}`}
                      type="button"
                      onClick={() => {
                        setDate(s.date)
                        setTime(s.time)
                        if (s.providerId) setProviderId(s.providerId)
                      }}
                      className={`rounded-md border px-2 py-1 text-xs tabular-nums ${active ? "border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200" : "border-border hover:bg-muted"}`}
                    >
                      {fmtDayShort(s.date)} {s.time}
                      {providers.length > 1 && s.providerId && <span className="ml-1 text-muted-foreground">· {providers.find((p) => p.id === s.providerId)?.name.split(" ").slice(-1)[0]}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {draft.mode === "create" && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="bk-notes">Notes (internal)</Label>
                <Textarea id="bk-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
              </div>
              <div className="grid gap-2 rounded-lg bg-muted/40 p-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> Repeat
                </label>
                {repeat && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    every
                    <Input type="number" min={1} max={52} value={everyWeeks} onChange={(e) => setEveryWeeks(Number(e.target.value) || 1)} className="h-8 w-16" aria-label="Every N weeks" />
                    weeks,
                    <Input type="number" min={2} max={52} value={count} onChange={(e) => setCount(Number(e.target.value) || 2)} className="h-8 w-16" aria-label="Number of appointments" />
                    appointments in total
                  </div>
                )}
              </div>
            </>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            {draft.mode === "move" ? "Tell the patient about the new time (SMS/email)" : "Send the patient a confirmation (SMS/email)"}
          </label>

          {problem && (
            <div role="alert" className={`rounded-lg border p-3 text-sm ${problem.kind === "error" ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"}`}>
              <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4" /> {problem.message}</p>
              {problem.issues.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {problem.issues.map((i, n) => (
                    <li key={n}>{ISSUE_LABEL[i.reason] ?? i.reason}{i.detail ? ` (${i.detail})` : ""}</li>
                  ))}
                </ul>
              )}
              {problem.kind === "warnings" && (
                <Button type="button" size="sm" className="mt-2" disabled={busy} onClick={() => submit({ acknowledgeWarnings: true, allowOverlap: problem.issues.some((i) => i.reason === "conflict") })}>
                  {draft.mode === "move" ? "Move anyway" : "Book anyway"}
                </Button>
              )}
              {problem.kind === "conflict" && canDoubleBook && (
                <Button type="button" size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => submit({ acknowledgeWarnings: true, allowOverlap: true })}>
                  Double-book on purpose
                </Button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {patient && !draft.waitlistEntryId && (
              <button type="button" onClick={() => setWaitlisting(true)} className="mr-auto flex items-center gap-1.5 text-sm text-violet-700 hover:underline dark:text-violet-300" title="No time suits them? Put them on the waiting list and the agenda will suggest them when a time frees up">
                <Hourglass className="h-4 w-4" /> {draft.mode === "move" ? "Wants it sooner — waiting list" : "No good time? Waiting list"}
              </button>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || !date || !time} className="min-w-28">
              {busy ? <Loader2 className="animate-spin" /> : draft.mode === "move" ? "Move" : repeat ? `Book ${count}` : "Book"}
            </Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
