"use client"

/** Put a patient on the waiting list: what they need, with whom, from when, and morning or afternoon. */
import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AgendaPayload, TimeOfDay } from "./types"
import { addDays, fmtDayShort, fmtTime } from "./wall"

type Props = {
  payload: AgendaPayload
  patient: { id: string; name: string }
  type?: string | null
  providerId?: string | null
  /** The booked appointment they would like sooner. */
  current?: { id: string; start: string } | null
  onDone: (message: string) => void
  onCancel: () => void
}

const selectCls = "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

export function WaitlistForm({ payload, patient, type, providerId, current, onDone, onCancel }: Props) {
  const [wantType, setWantType] = useState(type ?? "")
  const [wantProvider, setWantProvider] = useState(providerId && providerId !== "__none" ? providerId : "")
  const [fromDate, setFromDate] = useState(payload.today)
  const [untilDate, setUntilDate] = useState(current ? addDays(current.start.slice(0, 10), -1) : "")
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("ANY")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/agenda/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          patientId: patient.id,
          type: wantType || null,
          providerId: wantProvider || null,
          fromDate,
          untilDate: untilDate || null,
          timeOfDay,
          notes: notes.trim() || null,
          currentAppointmentId: current?.id ?? null,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? "Could not save")
      onDone(d.created === false ? `${patient.name}: waiting list updated.` : `${patient.name} is on the waiting list.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3 text-sm dark:border-violet-900 dark:bg-violet-950/20">
      <p>
        <strong>{patient.name}</strong> goes on the waiting list.
        {current && <> They keep {fmtDayShort(current.start.slice(0, 10))} {fmtTime(current.start)} until an earlier time is found.</>}
        {" "}When a time that suits them frees up, the agenda shows them first.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label htmlFor="wl-type">For</Label>
          <select id="wl-type" className={selectCls} value={wantType} onChange={(e) => setWantType(e.target.value)}>
            <option value="">Any appointment</option>
            {payload.appointmentTypes.filter((t) => t.active).map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="wl-provider">With</Label>
          <select id="wl-provider" className={selectCls} value={wantProvider} onChange={(e) => setWantProvider(e.target.value)}>
            <option value="">Any dentist</option>
            {payload.providers.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="wl-from">From</Label>
          <Input id="wl-from" type="date" value={fromDate} min={payload.today} onChange={(e) => e.target.value && setFromDate(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="wl-until">Until (optional)</Label>
          <Input id="wl-until" type="date" value={untilDate} min={fromDate} onChange={(e) => setUntilDate(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Time of day">
        {(["ANY", "MORNING", "AFTERNOON"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={timeOfDay === t}
            onClick={() => setTimeOfDay(t)}
            className={`rounded-full border px-3 py-1 text-xs ${timeOfDay === t ? "border-violet-600 bg-violet-600 text-white" : "border-border bg-background hover:bg-muted"}`}
          >
            {t === "ANY" ? "Any time" : t === "MORNING" ? "Mornings" : "Afternoons (13:00+)"}
          </button>
        ))}
      </div>
      <Input placeholder="Note (e.g. can come at short notice, not Fridays)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
      {error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Back</Button>
        <Button type="button" size="sm" disabled={busy} onClick={save} className="bg-violet-600 hover:bg-violet-700">
          {busy && <Loader2 className="animate-spin" />} Add to waiting list
        </Button>
      </div>
    </div>
  )
}
