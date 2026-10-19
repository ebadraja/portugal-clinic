"use client"

/**
 * Month at a glance: how full each day is, closed days greyed, click to open the day.
 */
import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { addDays, addMonths, fmt, startOfWeek, weekday } from "./wall"

type Props = {
  selected: string
  today: string
  rangeFrom: string
  rangeTo: string
  closedWeekdays: number[]
  closures: { date: string; name: string }[]
  version: number
  onPick: (date: string) => void
}

export function MiniCalendar({ selected, today, rangeFrom, rangeTo, closedWeekdays, closures, version, onPick }: Props) {
  const [month, setMonth] = useState(selected.slice(0, 7))
  const [counts, setCounts] = useState<Record<string, { booked: number; confirmed: number }>>({})
  // Follow the agenda when it moves to another month.
  const [lastSelected, setLastSelected] = useState(selected)
  if (selected !== lastSelected) {
    setLastSelected(selected)
    setMonth(selected.slice(0, 7))
  }

  const first = `${month}-01`
  const gridStart = startOfWeek(first)
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart])

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`/api/agenda/summary?from=${days[0]}&to=${days[41]}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { days: {} }))
      .then((d) => setCounts(d.days ?? {}))
      .catch(() => {})
    return () => ctrl.abort()
  }, [days, version])

  const max = Math.max(4, ...Object.values(counts).map((c) => c.booked))
  return (
    <section className="rounded-xl border border-border bg-card p-3" aria-label="Month">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => setMonth(addMonths(first, -1).slice(0, 7))} className="rounded p-1 hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-sm font-medium capitalize">{fmt(first, { month: "long", year: "numeric" })}</span>
        <button type="button" aria-label="Next month" onClick={() => setMonth(addMonths(first, 1).slice(0, 7))} className="rounded p-1 hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted-foreground">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="mt-0.5 grid grid-cols-7 gap-0.5">
        {days.map((d) => {
          const c = counts[d]
          const inMonth = d.slice(0, 7) === month
          const closure = closures.find((x) => x.date === d)
          const closed = closedWeekdays.includes(weekday(d)) || !!closure
          const inRange = d >= rangeFrom && d <= rangeTo
          const load = c ? Math.min(1, c.booked / max) : 0
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              title={`${fmt(d, { weekday: "long", day: "numeric", month: "long" })}${closure ? ` — ${closure.name}` : ""}${c ? ` · ${c.booked} appointment(s), ${c.booked - c.confirmed} to confirm` : ""}`}
              className={`relative flex h-8 flex-col items-center justify-center rounded-md text-xs tabular-nums ${inRange ? "bg-blue-50 dark:bg-blue-950/40" : ""} ${d === selected ? "ring-2 ring-blue-600" : ""} ${inMonth ? "" : "opacity-40"} ${closed ? "text-muted-foreground line-through decoration-slate-300" : "hover:bg-muted"}`}
            >
              <span className={d === today ? "rounded-full bg-blue-600 px-1.5 font-semibold text-white" : ""}>{Number(d.slice(8))}</span>
              {c && c.booked > 0 && (
                <span className="absolute bottom-0.5 h-1 rounded-full bg-blue-500" style={{ width: `${30 + load * 60}%`, opacity: 0.35 + load * 0.65 }} />
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
