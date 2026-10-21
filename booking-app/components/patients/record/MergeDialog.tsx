"use client"

/**
 * Merge two records of the same person. Shows the likely duplicates (same name, phone or NIF)
 * with what each holds, then asks which record to keep. Everything moves into the kept one.
 */
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Loader2, Search, Users } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { fmtDate, phoneLabel } from "./types"

type Candidate = {
  id: string
  name: string
  phone: string | null
  nif: string | null
  dateOfBirth: string | null
  zappyNumber: string | null
  fromBooking: boolean
  lastVisitAt: string | null
  appointments: number
  notes: number
  reasons: string[]
}

export type MergeSource = Omit<Candidate, "reasons">

function Facts({ c }: { c: MergeSource }) {
  return (
    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500 dark:text-slate-400">
      <span>{c.phone ? phoneLabel(c.phone) : "no phone"}</span>
      {c.dateOfBirth && <span>born {fmtDate(c.dateOfBirth)}</span>}
      {c.nif && <span>NIF {c.nif}</span>}
      {c.zappyNumber && <span>Zappy nº {c.zappyNumber}</span>}
      {c.fromBooking && <span className="text-amber-700 dark:text-amber-300">made from a Zappy booking</span>}
      <span>{c.appointments} appointment{c.appointments === 1 ? "" : "s"} · {c.notes} note{c.notes === 1 ? "" : "s"}</span>
      <span>{c.lastVisitAt ? `last seen ${fmtDate(c.lastVisitAt, { month: "short", year: "numeric" })}` : "no visits"}</span>
    </p>
  )
}

export function MergeDialog({ open, onClose, source }: { open: boolean; onClose: () => void; source: MergeSource }) {
  const router = useRouter()
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<Candidate[]>([])
  const [other, setOther] = useState<Candidate | null>(null)
  /** Which record survives: by default the other one when this was made from a booking. */
  const [keepThis, setKeepThis] = useState(!source.fromBooking)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const ctrl = new AbortController()
    fetch(`/api/patients/${source.id}/merge`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { candidates: [] }))
      .then((d) => setCandidates(d.candidates ?? []))
      .catch(() => {})
    return () => ctrl.abort()
  }, [open, source.id])

  useEffect(() => {
    if (q.trim().length < 2) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/patients/directory?q=${encodeURIComponent(q.trim())}&limit=8`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((d) => setHits((d.data ?? []).filter((p: { id: string }) => p.id !== source.id).map((p: { id: string; name: string; phone: string | null; nif: string | null; totalVisits: number; lastVisitAt: string | null; fromZappy: boolean }) => ({
          id: p.id, name: p.name, phone: p.phone, nif: p.nif, dateOfBirth: null, zappyNumber: null, fromBooking: false, lastVisitAt: p.lastVisitAt, appointments: p.totalVisits, notes: 0, reasons: [],
        }))))
        .catch(() => {})
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q, source.id])

  async function merge() {
    if (!other) return
    setBusy(true)
    setError(null)
    const [from, into] = keepThis ? [other.id, source.id] : [source.id, other.id]
    try {
      const res = await fetch(`/api/patients/${from}/merge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intoId: into }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? "The merge failed")
      onClose()
      // Kept this record: reload it with everything that moved in; otherwise open the kept one.
      if (into === source.id) window.location.reload()
      else router.push(`/patients/${into}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const list = q.trim().length >= 2 ? hits : candidates ?? []
  const kept = other ? (keepThis ? source : other) : null
  const gone = other ? (keepThis ? other : source) : null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-blue-600" /> Merge duplicate records</DialogTitle>
          <DialogDescription>Same person, two records? Pick the other record. Appointments, notes, calls and messages all move into the one you keep.</DialogDescription>
        </DialogHeader>

        {!other ? (
          <div className="grid gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">This record</p>
              <p className="font-medium text-slate-900 dark:text-slate-100">{source.name}</p>
              <Facts c={source} />
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search another patient by name, phone or NIF" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900" />
            </div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{q.trim().length >= 2 ? "Search results" : "Likely the same person"}</p>
            {candidates === null && q.trim().length < 2 ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : list.length === 0 ? (
              <p className="text-sm text-slate-500">{q.trim().length >= 2 ? "No one found." : "No record with the same name, phone or NIF. Search above."}</p>
            ) : (
              <ul className="grid gap-2">
                {list.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {c.name}
                        {c.reasons.map((r) => <span key={r} className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-normal text-blue-700 dark:bg-blue-950 dark:text-blue-300">{r}</span>)}
                      </p>
                      <Facts c={c} />
                    </div>
                    <Button size="sm" variant="outline" onClick={() => { setOther(c); setKeepThis(source.fromBooking ? false : !c.fromBooking && c.appointments > source.appointments ? false : true) }}>Choose</Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
              <div className="rounded-xl border border-red-200 bg-red-50/60 p-3 dark:border-red-900 dark:bg-red-950/30">
                <p className="text-xs font-medium uppercase tracking-wide text-red-700 dark:text-red-300">Deleted after moving</p>
                <p className="font-medium">{gone!.name}</p>
                <Facts c={gone!} />
              </div>
              <ArrowRight className="mx-auto h-5 w-5 rotate-90 text-slate-400 sm:rotate-0" />
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Kept</p>
                <p className="font-medium">{kept!.name}</p>
                <Facts c={kept!} />
              </div>
            </div>
            <button type="button" onClick={() => setKeepThis((k) => !k)} className="justify-self-center text-sm text-blue-700 hover:underline dark:text-blue-300">
              Keep “{gone!.name}” instead
            </button>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
              <li>All appointments, notes, calls, messages, documents and callbacks move to “{kept!.name}”. A booking both records have is kept once.</li>
              <li>Details “{kept!.name}” is missing (phone, date of birth, NIF, allergies…) are filled in from the other record; nothing it already has is overwritten.</li>
              <li>Future Zappy imports put this person&apos;s bookings on the kept record. A note on the record says what was merged.</li>
            </ul>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOther(null)} disabled={busy}>Back</Button>
              <Button onClick={merge} disabled={busy} className="min-w-32">{busy ? <Loader2 className="animate-spin" /> : "Merge — can't be undone"}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
