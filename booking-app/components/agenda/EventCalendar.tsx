"use client"

/**
 * React wrapper for @event-calendar/core (MIT; vkurko/calendar).
 *
 * Mounted once on the client. Option changes are applied with setOption, only for the keys
 * whose value changed. Function options are wrapped once so callers can pass fresh closures
 * every render without re-initialising the calendar.
 */
import "@event-calendar/core/index.css"
import { useEffect, useRef } from "react"
import type { Calendar } from "@event-calendar/core"

type Options = Calendar.Options
type AnyFn = (...args: unknown[]) => unknown

export function EventCalendar({ options, className }: { options: Options; className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const cal = useRef<Calendar | null>(null)
  const latest = useRef<Options>(options)
  const applied = useRef<Partial<Options>>({})
  const stable = useRef(new Map<string, AnyFn>())

  // Function options become stable trampolines that always call the latest closure.
  function prepared(opts: Options): Options {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(opts)) {
      if (typeof v === "function" && !STATIC_FUNCTION_KEYS.has(k)) {
        if (!stable.current.has(k)) {
          stable.current.set(k, (...args: unknown[]) => {
            const fn = (latest.current as Record<string, unknown>)[k]
            return typeof fn === "function" ? (fn as AnyFn)(...args) : undefined
          })
        }
        out[k] = stable.current.get(k)
      } else {
        out[k] = v
      }
    }
    return out as Options
  }

  useEffect(() => {
    latest.current = options
  })

  useEffect(() => {
    let cancelled = false
    let instance: Calendar | null = null
    let destroy: ((c: Calendar) => Promise<void>) | null = null
    void import("@event-calendar/core").then((ec) => {
      if (cancelled || !host.current) return
      destroy = ec.destroyCalendar
      const initial = prepared(latest.current)
      instance = ec.createCalendar(host.current, [ec.TimeGrid, ec.ResourceTimeGrid, ec.DayGrid, ec.List, ec.Interaction], initial)
      applied.current = { ...initial }
      cal.current = instance
    })
    return () => {
      cancelled = true
      if (instance && destroy) void destroy(instance)
      cal.current = null
    }
  }, [])

  useEffect(() => {
    const c = cal.current
    if (!c) return
    const next = prepared(options)
    // `view` and `date` must be set before the data that depends on them.
    const order = Object.keys(next).sort((a, b) => rank(a) - rank(b))
    const cur = applied.current as Record<string, unknown>
    const nxt = next as Record<string, unknown>
    const setter = c as unknown as { setOption(name: string, value: unknown): void }
    for (const key of order) {
      if (cur[key] !== nxt[key]) {
        setter.setOption(key, nxt[key])
        cur[key] = nxt[key]
      }
    }
  })

  return <div ref={host} className={className} />
}

/** Formatter callbacks are pure; they can be passed as-is. */
const STATIC_FUNCTION_KEYS = new Set<string>(["dayHeaderFormat", "slotLabelFormat", "titleFormat", "eventTimeFormat", "listDayFormat", "listDaySideFormat"])

function rank(key: string): number {
  if (key === "view") return 0
  if (key === "date") return 1
  if (key === "resources") return 2
  if (key === "events") return 9
  return 5
}
