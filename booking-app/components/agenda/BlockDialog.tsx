"use client"

import { useState } from "react"
import { Loader2, Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AgendaBlock, AgendaPayload } from "./types"
import { BLOCK_KIND_LABEL } from "./strings"
import { fmtDayShort, fmtTime } from "./wall"

export type BlockDraft =
  | { mode: "create"; date: string; start: string; end: string; providerId: string | null }
  | { mode: "view"; block: AgendaBlock }

const selectCls = "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

type BlockProps = {
  draft: BlockDraft | null
  payload: AgendaPayload
  readOnly: boolean
  onClose: () => void
  onDone: (message: string) => void
}

let blockSeq = 0
const blockKeys = new WeakMap<BlockDraft, number>()

/** A fresh form for every opened draft. */
export function BlockDialog(props: BlockProps) {
  if (!props.draft) return null
  if (!blockKeys.has(props.draft)) blockKeys.set(props.draft, ++blockSeq)
  return <BlockForm key={blockKeys.get(props.draft)} {...props} draft={props.draft} />
}

function BlockForm({ draft, payload, readOnly, onClose, onDone }: BlockProps & { draft: BlockDraft }) {
  const providers = payload.providers.filter((p) => p.active)
  const c = draft.mode === "create" ? draft : null
  const [providerId, setProviderId] = useState(c?.providerId && c.providerId !== "__none" ? c.providerId : providers.length === 1 ? providers[0].id : "")
  const [date, setDate] = useState(c?.date ?? "")
  const [endDate, setEndDate] = useState(c?.date ?? "")
  const [start, setStart] = useState(c?.start ?? "")
  const [end, setEnd] = useState(c?.end ?? "")
  const [allDay, setAllDay] = useState(false)
  const [kind, setKind] = useState("TIME_OFF")
  const [reason, setReason] = useState("")
  const [repeatWeeks, setRepeatWeeks] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/agenda/blocks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerId: providerId || null,
          date,
          endDate: allDay ? endDate || date : undefined,
          start: allDay ? undefined : start,
          end: allDay ? undefined : end,
          allDay,
          kind,
          reason: reason.trim() || null,
          repeatWeeks: repeatWeeks > 1 ? repeatWeeks : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Failed")
      onDone(data.overlappingAppointments > 0
        ? `Time blocked. ${data.overlappingAppointments} existing appointment(s) are inside it — move them if needed.`
        : "Time blocked.")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(block: AgendaBlock, following: boolean) {
    setBusy(true)
    try {
      const res = await fetch(`/api/agenda/blocks/${block.id}${following ? "?series=following" : ""}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed")
      onDone("Block removed.")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (draft.mode === "view") {
    const b = draft.block
    const who = b.providerId ? payload.providers.find((p) => p.id === b.providerId)?.name ?? "Dentist" : "Whole clinic"
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{b.reason || BLOCK_KIND_LABEL[b.kind] || "Blocked time"}</DialogTitle>
            <DialogDescription>
              {who} · {fmtDayShort(b.start.slice(0, 10))} {fmtTime(b.start)} – {b.end.slice(0, 10) !== b.start.slice(0, 10) ? `${fmtDayShort(b.end.slice(0, 10))} ` : ""}{fmtTime(b.end)}
            </DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {!readOnly && (
            <div className="flex flex-wrap justify-end gap-2">
              {b.seriesId && (
                <Button variant="outline" disabled={busy} onClick={() => remove(b, true)}>Remove this and following</Button>
              )}
              <Button variant="destructive" disabled={busy} onClick={() => remove(b, false)}>
                {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} Remove
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Block time</DialogTitle>
          <DialogDescription>Nobody — desk, Acácia or patients — can book inside it.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void create() }}>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bl-who">For</Label>
              <select id="bl-who" className={selectCls} value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                <option value="">Whole clinic</option>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bl-kind">Kind</Label>
              <select id="bl-kind" className={selectCls} value={kind} onChange={(e) => setKind(e.target.value)}>
                {Object.entries(BLOCK_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Whole day(s)
          </label>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bl-date">{allDay ? "From" : "Date"}</Label>
              <Input id="bl-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            {allDay ? (
              <div className="col-span-2 grid gap-1.5">
                <Label htmlFor="bl-end-date">To (inclusive)</Label>
                <Input id="bl-end-date" type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            ) : (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="bl-start">From</Label>
                  <Input id="bl-start" type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="bl-end">To</Label>
                  <Input id="bl-end" type="time" step={300} value={end} onChange={(e) => setEnd(e.target.value)} required />
                </div>
              </>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bl-reason">Reason (shown in the agenda)</Label>
            <Input id="bl-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Training, Holidays" maxLength={200} />
          </div>
          <div className="flex items-center gap-2 text-sm">
            Repeat weekly
            <Input type="number" min={1} max={52} value={repeatWeeks} onChange={(e) => setRepeatWeeks(Number(e.target.value) || 1)} className="h-8 w-16" aria-label="Number of weeks" />
            time(s)
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : "Block"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
