"use client"

import { useState } from "react"
import { Filter, X } from "lucide-react"
import type { AgendaType } from "./types"
import { EMPTY_FILTER, activeFilterCount, type EventFilter } from "./calendarModel"

const STATUSES: [EventFilter["statuses"][number], string][] = [
  ["SCHEDULED", "Booked (to confirm)"],
  ["CONFIRMED", "Confirmed"],
  ["ARRIVED", "Arrived"],
  ["COMPLETED", "Completed"],
  ["NO_SHOW", "No-show"],
  ["CANCELLED", "Cancelled"],
]
const SOURCES: [EventFilter["sources"][number], string][] = [
  ["STAFF", "Desk"],
  ["VOICE_AGENT", "Acácia (AI)"],
  ["ONLINE", "Online / patient link"],
  ["IMPORT", "Imported (Zappy)"],
]

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
}

export function AgendaFilters({ value, onChange, types }: { value: EventFilter; onChange: (f: EventFilter) => void; types: AgendaType[] }) {
  const [open, setOpen] = useState(false)
  const count = activeFilterCount(value)
  const box = (checked: boolean, onToggle: () => void, label: string) => (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-muted">
      <input type="checkbox" checked={checked} onChange={onToggle} /> {label}
    </label>
  )
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs ${count ? "border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200" : "border-input bg-background dark:bg-input/30"}`}
      >
        <Filter className="h-3.5 w-3.5" /> Filters{count ? ` (${count})` : ""}
      </button>
      {count > 0 && (
        <button type="button" aria-label="Clear filters" onClick={() => onChange(EMPTY_FILTER)} className="absolute -right-2 -top-2 rounded-full bg-blue-600 p-0.5 text-white">
          <X className="h-3 w-3" />
        </button>
      )}
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 z-40 mt-1 grid w-[min(34rem,calc(100vw-2rem))] gap-3 rounded-xl border border-border bg-popover p-3 text-xs shadow-xl sm:grid-cols-3">
            <fieldset>
              <legend className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">Status</legend>
              {STATUSES.map(([k, label]) => box(value.statuses.includes(k), () => onChange({ ...value, statuses: toggle(value.statuses, k) }), label))}
            </fieldset>
            <fieldset>
              <legend className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">Booked by</legend>
              {SOURCES.map(([k, label]) => box(value.sources.includes(k), () => onChange({ ...value, sources: toggle(value.sources, k) }), label))}
              <legend className="mb-1 mt-3 font-semibold uppercase tracking-wide text-muted-foreground">Clinical</legend>
              {box(value.alertsOnly, () => onChange({ ...value, alertsOnly: !value.alertsOnly }), "Only patients with alerts")}
            </fieldset>
            <fieldset>
              <legend className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">Type</legend>
              <div className="max-h-56 overflow-y-auto">
                {types.filter((t) => t.active).map((t) => box(value.types.includes(t.type), () => onChange({ ...value, types: toggle(value.types, t.type) }), t.label))}
              </div>
            </fieldset>
            <div className="flex justify-end gap-2 sm:col-span-3">
              <button type="button" onClick={() => onChange(EMPTY_FILTER)} className="rounded-md px-2 py-1 hover:bg-muted">Clear</button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md bg-blue-600 px-3 py-1 font-medium text-white hover:bg-blue-700">Done</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
