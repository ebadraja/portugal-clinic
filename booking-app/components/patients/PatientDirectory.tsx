"use client"

/**
 * Patient list: one search box, five plain filters a dentist understands, and calm rows
 * (who, how to reach them, alerts, when last seen, what's next, Book). Data-quality views live
 * under "Needs attention" so the everyday list isn't covered in warnings.
 */
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, Loader2, Phone, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"

type Row = {
  id: string
  name: string
  firstName: string
  lastName: string
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

type Counts = {
  all: number; active: number; seen12: number; lost: number; potential: number; new: number; recallDue: number
  missingDob: number; missingPhone: number; nameToCheck: number; possibleDuplicates: number
}
type Summary = { counts: Counts; tags: { tag: string; count: number }[]; recallMonths: number }

/** Everyday views */
type View = "all" | "seen12" | "recall" | "lost" | "new"
/** "Needs attention" views */
type Attention = "potential" | "missing-phone" | "missing-dob" | "name" | "duplicates"

const ATTENTION: { id: Attention; label: string; hint: string; count: (c: Counts) => number }[] = [
  { id: "potential", label: "No visits on record", hint: "In Zappy but never had an appointment there (often enquiries or old contacts)", count: (c) => c.potential },
  { id: "missing-phone", label: "No phone number", hint: "No SMS reminders or calls possible", count: (c) => c.missingPhone },
  { id: "missing-dob", label: "No date of birth", hint: "Acácia can only recognise them by their caller ID", count: (c) => c.missingDob },
  { id: "name", label: "Names to check", hint: "No surname, or a name that is a number or symbols", count: (c) => c.nameToCheck },
  { id: "duplicates", label: "Possible duplicates", hint: "Share a phone number or NIF with another record", count: (c) => c.possibleDuplicates },
]

const AVATAR = ["bg-blue-100 text-blue-800", "bg-emerald-100 text-emerald-800", "bg-amber-100 text-amber-800", "bg-violet-100 text-violet-800", "bg-rose-100 text-rose-800", "bg-sky-100 text-sky-800"]

function initials(r: Row): string {
  const a = (r.firstName.match(/\p{L}/u)?.[0] ?? "?").toUpperCase()
  const b = (r.lastName.split(" ").filter(Boolean).at(-1)?.match(/\p{L}/u)?.[0] ?? "").toUpperCase()
  return a + b
}

function avatarCls(id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR[h % AVATAR.length]
}

function lastSeen(iso: string | null): string {
  if (!iso) return "No visits on record"
  return `Last seen ${new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(iso))}`
}

function nextLabel(wall: string): string {
  const d = new Date(`${wall}:00Z`)
  return `${new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(d)}, ${wall.slice(11, 16)}`
}

function phoneLabel(e164: string): string {
  const m = /^\+351(\d{3})(\d{3})(\d{3})$/.exec(e164)
  return m ? `${m[1]} ${m[2]} ${m[3]}` : e164
}

export function PatientDirectory({ refreshKey }: { refreshKey: number }) {
  const router = useRouter()
  const [q, setQ] = useState("")
  const [debounced, setDebounced] = useState("")
  const [view, setView] = useState<View>("all")
  const [attention, setAttention] = useState<Attention | null>(null)
  const [attentionOpen, setAttentionOpen] = useState(false)
  const [tag, setTag] = useState("")
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
    const p = new URLSearchParams({ page: String(page), limit: "50", sort })
    if (debounced) p.set("q", debounced)
    if (attention) {
      if (attention === "potential") p.set("lifecycle", "potential")
      if (attention === "missing-phone") p.set("missing", "phone")
      if (attention === "missing-dob") p.set("missing", "dob")
      if (attention === "name") p.set("check", "name")
      if (attention === "duplicates") p.set("check", "duplicates")
    } else {
      if (view === "seen12") p.set("lifecycle", "seen12")
      if (view === "lost") p.set("lifecycle", "lost")
      if (view === "new") p.set("lifecycle", "new")
      if (view === "recall") p.set("recall", "1")
    }
    if (tag) p.set("tag", tag)
    return p.toString()
  }, [debounced, view, attention, tag, sort, page])
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

  const c = summary?.counts
  const views: { id: View; label: string; count?: number; hint: string }[] = [
    { id: "all", label: "All patients", count: c?.all, hint: "Everyone in the practice" },
    { id: "seen12", label: "Seen in the last 12 months", count: c?.seen12, hint: "Visited in the last year, or has an appointment booked" },
    { id: "recall", label: "Due for a check-up", count: c?.recallDue, hint: `Last visit more than ${summary?.recallMonths ?? 6} months ago and nothing booked — call them` },
    { id: "lost", label: "Not seen for 18+ months", count: c?.lost, hint: "Nothing booked and no visit in 18 months" },
    { id: "new", label: "New this month", count: c?.new, hint: "Became a patient in the last 30 days" },
  ]
  const chooseView = (v: View) => {
    setView(v)
    setAttention(null)
    setPage(1)
  }
  const chooseAttention = (a: Attention | null) => {
    setAttention(a)
    setAttentionOpen(false)
    setPage(1)
  }
  const attentionItem = ATTENTION.find((a) => a.id === attention)
  const book = (id: string) => router.push(`/appointments?agenda=1&patient=${encodeURIComponent(id)}`)
  const from = total === 0 ? 0 : (page - 1) * 50 + 1
  const to = Math.min(total, page * 50)

  return (
    <div className="grid gap-4">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1) }}
          placeholder="Search by name, phone or NIF"
          aria-label="Search patients"
          autoFocus
          className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-10 text-base shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 dark:border-slate-700 dark:bg-slate-900"
        />
        {q && (
          <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Views */}
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Patient views">
        {views.map((v) => {
          const on = !attention && view === v.id
          return (
            <button
              key={v.id}
              role="tab"
              aria-selected={on}
              title={v.hint}
              onClick={() => chooseView(v.id)}
              className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${on ? "border-blue-600 bg-blue-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}
            >
              {v.label}
              {v.count !== undefined && <span className={`tabular-nums text-xs ${on ? "text-blue-100" : "text-slate-400"}`}>{v.count.toLocaleString("en-GB")}</span>}
            </button>
          )
        })}

        <div className="relative">
          <button
            type="button"
            onClick={() => setAttentionOpen((o) => !o)}
            aria-expanded={attentionOpen}
            className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium ${attention ? "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" : "border-dashed border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"}`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {attentionItem ? attentionItem.label : "Needs attention"}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {attentionOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setAttentionOpen(false)} aria-hidden />
              <div role="menu" className="absolute left-0 z-40 mt-1 w-80 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                {ATTENTION.map((a) => (
                  <button key={a.id} role="menuitem" onClick={() => chooseAttention(a.id)} className={`flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${attention === a.id ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}>
                    <span>
                      <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{a.label}</span>
                      <span className="block text-xs text-slate-500">{a.hint}</span>
                    </span>
                    {c && <span className="text-xs tabular-nums text-slate-400">{a.count(c).toLocaleString("en-GB")}</span>}
                  </button>
                ))}
                {attention && (
                  <button role="menuitem" onClick={() => chooseAttention(null)} className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-blue-700 hover:bg-slate-50 dark:text-blue-300 dark:hover:bg-slate-800">
                    Back to all patients
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Secondary controls */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
        <span>{loading ? <Loader2 className="inline h-4 w-4 animate-spin" /> : total === 0 ? "No patients" : `Showing ${from.toLocaleString("en-GB")}–${to.toLocaleString("en-GB")} of ${total.toLocaleString("en-GB")}`}</span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {summary && summary.tags.length > 0 && (
            <select aria-label="Tag" className="h-9 max-w-56 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900" value={tag} onChange={(e) => { setTag(e.target.value); setPage(1) }}>
              <option value="">Any tag</option>
              {summary.tags.map((t) => <option key={t.tag} value={t.tag}>{t.tag.length > 40 ? `${t.tag.slice(0, 40)}…` : t.tag} ({t.count})</option>)}
            </select>
          )}
          <select aria-label="Sort" className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900" value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); setPage(1) }}>
            <option value="name">Sort: A–Z</option>
            <option value="lastVisit">Sort: last seen</option>
            <option value="created">Sort: newest patients</option>
          </select>
        </span>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p>}

      {/* List */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {rows === null ? (
          <div className="flex h-48 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-medium text-slate-700 dark:text-slate-200">No patients found</p>
            <p className="mt-1 text-sm text-slate-500">{debounced ? `Nothing matches “${debounced}”. Check the spelling, or search by phone number.` : "Nobody in this list."}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((p) => (
              <li key={p.id} className="group relative flex flex-col gap-3 px-4 py-3.5 hover:bg-slate-50 sm:flex-row sm:items-center dark:hover:bg-slate-800/50">
                {/* Whole row opens the record */}
                <Link href={`/patients/${p.id}`} className="absolute inset-0" aria-label={`Open ${p.name}`} />
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarCls(p.id)}`} aria-hidden>{initials(p)}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-base font-medium text-slate-900 dark:text-slate-50">{p.name}</span>
                      {p.age !== null && <span className="text-sm text-slate-500">{p.age} y</span>}
                      {p.alerts.map((a) => (
                        <span key={a} className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900">
                          <AlertTriangle className="h-3 w-3" />{a}
                        </span>
                      ))}
                      {p.recallDue && <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900">Due for check-up</span>}
                      {p.lifecycle === "new" && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">New</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-slate-500 dark:text-slate-400">
                      {p.phone ? <span className="tabular-nums">{phoneLabel(p.phone)}</span> : <span className="text-slate-400">No phone</span>}
                      {p.nif && <span>NIF {p.nif}</span>}
                      {attention === "missing-dob" && <span className="text-amber-700">No date of birth</span>}
                      {p.tags.length > 0 && <span className="max-w-64 truncate" title={p.tags.join(" · ")}>{p.tags[0]}{p.tags.length > 1 ? ` +${p.tags.length - 1}` : ""}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 pl-13 text-sm sm:w-[22rem] sm:shrink-0 sm:pl-0">
                  <div className="min-w-0 flex-1">
                    <div className={p.lastVisitAt ? "text-slate-700 dark:text-slate-300" : "text-slate-400"}>{lastSeen(p.lastVisitAt)}</div>
                    {p.nextAppointment ? (
                      <Link href={`/appointments?agenda=1&appointment=${p.nextAppointment.id}`} className="relative z-10 text-blue-700 hover:underline dark:text-blue-300">
                        Next: {nextLabel(p.nextAppointment.start)}
                      </Link>
                    ) : (
                      <div className="text-slate-400">Nothing booked{p.noShows ? <span className="text-red-600"> · {p.noShows} no-show{p.noShows === 1 ? "" : "s"}</span> : ""}</div>
                    )}
                  </div>
                  <div className="relative z-10 flex shrink-0 gap-1.5">
                    {p.phone && (
                      <a href={`tel:${p.phone}`} aria-label={`Call ${p.name}`} title="Call" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-white hover:text-blue-700 dark:border-slate-700 dark:text-slate-300">
                        <Phone className="h-4 w-4" />
                      </a>
                    )}
                    <Button onClick={() => book(p.id)} className="h-9 gap-1.5 px-3"><CalendarPlus className="h-4 w-4" />Book</Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
          <span>Page {page} of {pages}</span>
          <span className="flex gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-9 gap-1"><ChevronLeft className="h-4 w-4" />Previous</Button>
            <Button variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)} className="h-9 gap-1">Next<ChevronRight className="h-4 w-4" /></Button>
          </span>
        </div>
      )}
    </div>
  )
}
