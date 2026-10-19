"use client"

/**
 * Patient directory: find anyone in a keystroke and see who needs attention — due a check-up,
 * never came back, missing a date of birth or phone. Every row links to the record and can be
 * booked straight into the agenda.
 */
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, Loader2, Phone, Search, Tag, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Row = {
  id: string
  name: string
  phone: string | null
  email: string | null
  nif: string | null
  age: number | null
  dobMissing: boolean
  birthday: string | null
  tags: string[]
  alerts: string[]
  lastVisitAt: string | null
  totalVisits: number
  noShows: number
  nextAppointment: { id: string; start: string; type: string; provider: string | null } | null
  lifecycle: "new" | "active" | "lost" | "potential"
  recallDue: boolean
  smsReminders: boolean
  fromZappy: boolean
}

type Summary = {
  counts: { all: number; active: number; lost: number; potential: number; new: number; recallDue: number; missingDob: number; missingPhone: number }
  tags: { tag: string; count: number }[]
  recallMonths: number
}

type Filter = "all" | "active" | "new" | "potential" | "lost" | "recall" | "missing-dob" | "missing-phone"

const LIFECYCLE_STYLE: Record<Row["lifecycle"], { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  active: { label: "Active", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  lost: { label: "Lost", cls: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  potential: { label: "Never came", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
}

function ago(iso: string | null): string {
  if (!iso) return "—"
  const months = Math.floor((Date.now() - new Date(iso).getTime()) / (30.44 * 86_400_000))
  if (months < 1) return "this month"
  if (months < 12) return `${months} mo ago`
  const y = Math.floor(months / 12)
  const m = months % 12
  return `${y} y${m ? ` ${m} mo` : ""} ago`
}

function wallLabel(wall: string): string {
  const d = new Date(`${wall}:00Z`)
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(d) + ` ${wall.slice(11, 16)}`
}

export function PatientDirectory({ onAddPatient, refreshKey }: { onAddPatient: () => void; refreshKey: number }) {
  const router = useRouter()
  const [q, setQ] = useState("")
  const [debounced, setDebounced] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [tag, setTag] = useState<string>("")
  const [upcoming, setUpcoming] = useState<"" | "yes" | "no">("")
  const [sort, setSort] = useState<"name" | "lastVisit" | "created">("name")
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [loadedKey, setLoadedKey] = useState("")
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit: "25", sort })
    if (debounced) p.set("q", debounced)
    if (["active", "new", "potential", "lost"].includes(filter)) p.set("lifecycle", filter)
    if (filter === "recall") p.set("recall", "1")
    if (filter === "missing-dob") p.set("missing", "dob")
    if (filter === "missing-phone") p.set("missing", "phone")
    if (tag) p.set("tag", tag)
    if (upcoming) p.set("upcoming", upcoming)
    return p.toString()
  }, [debounced, filter, tag, upcoming, sort, page])
  const loading = loadedKey !== params

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`/api/patients/directory?${params}`, { signal: ctrl.signal })
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? "Failed to load patients")
        setRows(d.data)
        setTotal(d.pagination.total)
        setPages(Math.max(1, d.pagination.totalPages))
        setError(null)
        setLoadedKey(params)
      })
      .catch((e: Error) => {
        if (e.name === "AbortError") return
        setError(e.message)
        setLoadedKey(params)
      })
    return () => ctrl.abort()
  }, [params, refreshKey])

  useEffect(() => {
    fetch("/api/patients/directory/summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSummary(d))
      .catch(() => {})
  }, [refreshKey])

  const chips: { id: Filter; label: string; count?: number; hint?: string }[] = [
    { id: "all", label: "All", count: summary?.counts.all },
    { id: "active", label: "Active", count: summary?.counts.active },
    { id: "new", label: "New", count: summary?.counts.new, hint: "Joined in the last 30 days" },
    { id: "recall", label: "Recall due", count: summary?.counts.recallDue, hint: `Last visit more than ${summary?.recallMonths ?? 6} months ago and nothing booked` },
    { id: "potential", label: "Never came", count: summary?.counts.potential, hint: "No visit on record and nothing booked" },
    { id: "lost", label: "Lost", count: summary?.counts.lost, hint: "No visit for 18 months and nothing booked" },
    { id: "missing-dob", label: "No date of birth", count: summary?.counts.missingDob, hint: "Acácia can only identify them by caller ID" },
    { id: "missing-phone", label: "No phone", count: summary?.counts.missingPhone, hint: "No SMS reminders possible" },
  ]
  const choose = (f: Filter) => { setFilter(f); setPage(1) }
  const book = (id: string) => router.push(`/appointments?agenda=1&patient=${encodeURIComponent(id)}`)
  const selectCls = "h-8 rounded-md border border-input bg-background px-2 text-xs dark:bg-input/30"

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            placeholder="Search name, phone, NIF, email or Zappy nº"
            className="h-10 pl-9"
            aria-label="Search patients"
            autoFocus
          />
          {q && (
            <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button onClick={onAddPatient} className="h-10">Add patient</Button>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Patient filters">
        {chips.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={filter === c.id}
            title={c.hint}
            onClick={() => choose(c.id)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${filter === c.id ? "border-blue-600 bg-blue-600 text-white" : "border-border bg-card text-slate-700 hover:bg-muted dark:text-slate-300"}`}
          >
            {c.label}
            {c.count !== undefined && <span className={`tabular-nums ${filter === c.id ? "text-blue-100" : "text-slate-400"}`}>{c.count}</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
        <Tag className="h-3.5 w-3.5" />
        <select aria-label="Tag" className={`${selectCls} max-w-64`} value={tag} onChange={(e) => { setTag(e.target.value); setPage(1) }}>
          <option value="">Any tag / segment</option>
          {summary?.tags.map((t) => <option key={t.tag} value={t.tag}>{t.tag.length > 60 ? `${t.tag.slice(0, 60)}…` : t.tag} ({t.count})</option>)}
        </select>
        <select aria-label="Upcoming appointment" className={selectCls} value={upcoming} onChange={(e) => { setUpcoming(e.target.value as "" | "yes" | "no"); setPage(1) }}>
          <option value="">Booked or not</option>
          <option value="yes">Has an upcoming appointment</option>
          <option value="no">Nothing booked</option>
        </select>
        <select aria-label="Sort" className={selectCls} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="name">Sort: name</option>
          <option value="lastVisit">Sort: last visit</option>
          <option value="created">Sort: newest patients</option>
        </select>
        <span className="ml-auto">{loading ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : `${total} patient${total === 1 ? "" : "s"}`}</span>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {rows === null ? (
          <div className="flex h-48 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">No patients match.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((p) => {
              const lc = LIFECYCLE_STYLE[p.lifecycle]
              return (
                <li key={p.id} className="grid gap-2 px-4 py-3 hover:bg-muted/40 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/patients/${p.id}`} className="truncate font-medium text-slate-900 hover:underline dark:text-slate-50">{p.name}</Link>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${lc.cls}`}>{lc.label}</span>
                      {p.recallDue && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">Recall due</span>}
                      {p.alerts.map((a) => (
                        <span key={a} className="inline-flex items-center gap-0.5 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800 dark:bg-red-950 dark:text-red-300" title="Clinical alert">
                          <AlertTriangle className="h-3 w-3" />{a}
                        </span>
                      ))}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{p.age !== null ? `${p.age} y` : p.birthday ? `🎂 ${p.birthday}` : <span className="text-amber-600">no date of birth</span>}</span>
                      {p.nif && <span>NIF {p.nif}</span>}
                      {p.fromZappy && <span>from Zappy</span>}
                      {p.tags.slice(0, 2).map((t) => <span key={t} className="max-w-48 truncate rounded bg-slate-100 px-1 dark:bg-slate-800" title={t}>{t}</span>)}
                      {p.tags.length > 2 && <span>+{p.tags.length - 2}</span>}
                    </div>
                  </div>
                  <div className="text-sm">
                    {p.phone ? (
                      <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 text-slate-700 hover:text-blue-700 dark:text-slate-300"><Phone className="h-3.5 w-3.5" />{p.phone}</a>
                    ) : <span className="text-xs text-amber-600">no phone</span>}
                    {!p.smsReminders && <div className="text-[11px] text-slate-400">SMS reminders off</div>}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    <div>Last visit: <span className="text-slate-800 dark:text-slate-200">{ago(p.lastVisitAt)}</span></div>
                    <div>{p.totalVisits} visit{p.totalVisits === 1 ? "" : "s"}{p.noShows ? <span className="text-red-600"> · {p.noShows} no-show{p.noShows === 1 ? "" : "s"}</span> : ""}</div>
                  </div>
                  <div className="text-xs">
                    {p.nextAppointment ? (
                      <Link href={`/appointments?agenda=1&appointment=${p.nextAppointment.id}`} className="text-blue-700 hover:underline dark:text-blue-300">
                        Next: {wallLabel(p.nextAppointment.start)}
                      </Link>
                    ) : <span className="text-slate-400">Nothing booked</span>}
                  </div>
                  <div className="flex gap-1.5 md:justify-end">
                    <Button size="sm" variant={p.nextAppointment ? "outline" : "default"} onClick={() => book(p.id)} className="gap-1"><CalendarPlus className="h-3.5 w-3.5" />Book</Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="tabular-nums text-slate-600 dark:text-slate-400">Page {page} of {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  )
}
