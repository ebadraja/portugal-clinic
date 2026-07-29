import { addDaysToDateString, getDayAvailability } from "@/lib/appointments/availability"

export type SlotOption = {
  date: string
  dateLabel: string
  times: { time: string; label: string }[]
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function to12Hour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number)
  const suffix = h >= 12 ? "pm" : "am"
  const hour   = h % 12 || 12
  return `${hour}:${String(m).padStart(2, "0")}${suffix}`
}

function formatDateLabel(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

/** Parse a preferred appointment date from natural language (best-effort). */
export function parsePreferredDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  if (iso) return iso[1]

  const lower = text.toLowerCase()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(today)
    d.setDate(d.getDate() + 1)
    return toIsoDate(d)
  }

  if (/\btoday\b/.test(lower)) return todayStr()

  const weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  for (let i = 0; i < weekdayNames.length; i++) {
    if (new RegExp(`\\b${weekdayNames[i]}\\b`).test(lower)) {
      const target = i
      const d = new Date(today)
      const diff = (target - d.getDay() + 7) % 7 || 7
      d.setDate(d.getDate() + diff)
      return toIsoDate(d)
    }
  }

  const md = lower.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/
  )
  if (md) {
    const months: Record<string, number> = {
      jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
      apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
      aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
      nov: 10, november: 10, dec: 11, december: 11,
    }
    const month = months[md[1]]
    const day   = parseInt(md[2], 10)
    let year    = today.getFullYear()
    const candidate = new Date(year, month, day)
    if (candidate < today) candidate.setFullYear(year + 1)
    return toIsoDate(candidate)
  }

  return null
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function isBookingMessage(text: string): boolean {
  return /\b(book|schedule|appointment|available|availability|see the doctor|checkup|visit)\b/i.test(text)
}

export function replyMentionsAvailability(reply: string): boolean {
  const t = reply.toLowerCase()
  return (
    /\bavailable on\b/.test(t) ||
    /\b(next available|availability|open slot|time slot|what date|which date|preferred date)\b/.test(t) ||
    /\b\d{1,2}:\d{2}\s*(am|pm)\b/.test(t)
  )
}

export function replyAsksForDate(reply: string): boolean {
  const t = reply.toLowerCase()
  return (
    /\b(what date|which date|preferred date|when would you like|what day)\b/.test(t) ||
    /\bdate.*prefer\b/.test(t)
  )
}

/** Slots for one day only — shown after parent picks a preferred date. */
export async function getDaySlotOptions(date: string): Promise<SlotOption | null> {
  const day = await getDayAvailability({ date, duration: 30 })
  if (!day.availableSlots.length) return null
  return {
    date,
    dateLabel: formatDateLabel(date),
    times: day.availableSlots.map((s) => ({
      time:  s.startTime,
      label: to12Hour(s.startTime),
    })),
  }
}

/** Next few days with any openings — fallback when no date parsed yet. */
export async function getUpcomingSlotOptions(rangeDays = 7): Promise<SlotOption[]> {
  const start = todayStr()
  const options: SlotOption[] = []

  for (let i = 0; i < rangeDays; i++) {
    const date = addDaysToDateString(start, i)
    const opt  = await getDaySlotOptions(date)
    if (opt) options.push(opt)
  }

  return options
}
