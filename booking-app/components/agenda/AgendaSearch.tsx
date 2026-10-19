"use client"

/**
 * Agenda search: find a patient by name, phone or NIF and jump straight to any of their
 * appointments (upcoming first), or start booking for them. Shortcut: "/".
 */
import { useEffect, useRef, useState } from "react"
import { AlertTriangle, CalendarPlus, Loader2, Search } from "lucide-react"
import type { PatientHit } from "./types"
import { STATUS_LABEL } from "./strings"
import { fmtDayShort, fmtTime } from "./wall"

type Props = {
  today: string
  typeLabel: (type: string) => string
  onJump: (appointment: { id: string; start: string }) => void
  onBookFor: (patient: { id: string; name: string }) => void
}

export function AgendaSearch({ today, typeLabel, onJump, onBookFor }: Props) {
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<PatientHit[]>([])
  const [loadedFor, setLoadedFor] = useState("")
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const query = q.trim()
  const searching = query.length >= 2 && loadedFor !== query

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      if (e.key === "/" && !(el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (query.length < 2) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/agenda/patients?withAppointments=1&q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => {
          setHits(d.patients ?? [])
          setLoadedFor(query)
        })
        .catch(() => {})
    }, 220)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [query])

  const close = () => {
    setOpen(false)
    setQ("")
  }

  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
      <input
        ref={input}
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Escape" && close()}
        placeholder="Find a patient…  ( / )"
        aria-label="Find a patient in the agenda"
        className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-8 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      />
      {searching && <Loader2 className="absolute right-2.5 top-2 h-4 w-4 animate-spin text-muted-foreground" />}
      {open && query.length >= 2 && !searching && (
        <>
          <div className="fixed inset-0 z-30" onClick={close} aria-hidden />
          <div className="absolute right-0 z-40 mt-1 max-h-[70vh] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-sm shadow-xl">
            {hits.length === 0 && <p className="px-2 py-3 text-muted-foreground">No patient matches “{query}”.</p>}
            {hits.map((p) => {
              const upcoming = (p.appointments ?? []).filter((a) => a.start.slice(0, 10) >= today && (a.status === "SCHEDULED" || a.status === "CONFIRMED"))
              const past = (p.appointments ?? []).filter((a) => !upcoming.includes(a)).reverse().slice(0, 2)
              return (
                <div key={p.id} className="rounded-lg px-2 py-2 hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                    {p.alerts.map((a) => (
                      <span key={a} className="inline-flex items-center gap-0.5 rounded bg-red-100 px-1 text-[10px] font-semibold text-red-800 dark:bg-red-950 dark:text-red-300"><AlertTriangle className="h-3 w-3" />{a}</span>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        onBookFor({ id: p.id, name: p.name })
                        close()
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      <CalendarPlus className="h-3.5 w-3.5" />Book
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">{p.phone ?? "no phone"}{p.dateOfBirth ? ` · ${p.dateOfBirth.split("-").reverse().join("/")}` : ""}</p>
                  {[...upcoming, ...past].map((a) => {
                    const isUpcoming = upcoming.includes(a)
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          onJump(a)
                          close()
                        }}
                        className={`mt-1 flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs ${isUpcoming ? "bg-blue-50 text-blue-900 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-100" : "text-muted-foreground hover:bg-muted"}`}
                      >
                        <span className="tabular-nums">{fmtDayShort(a.start.slice(0, 10))} {fmtTime(a.start)}</span>
                        <span className="truncate">{typeLabel(a.type)} · {STATUS_LABEL[a.status] ?? a.status}</span>
                      </button>
                    )
                  })}
                  {(p.appointments ?? []).length === 0 && <p className="mt-1 text-xs text-muted-foreground">No appointments in the last year.</p>}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
