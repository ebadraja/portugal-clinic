import prisma from "@/lib/prisma"
import {
  type ClinicSettings,
  type Provider,
  closureOn,
  getClinicSettings,
  hoursFor,
} from "@/lib/clinic/settings"
import {
  addDays,
  dayBoundsUtc,
  isValidDateString,
  minutesToHHMM,
  toMinutes,
  todayInZone,
  weekdayOf,
  zonedTimeToUtc,
} from "@/lib/clinic/time"

export type AvailabilitySlot = { startTime: string; endTime: string }

export type DayAvailability = {
  date: string
  provider: string | null
  availableSlots: AvailabilitySlot[]
  /** Why the day has no slots at all (holiday name, "closed", "past", "too_far"), else null. */
  closedReason?: string | null
}

export type BookedInterval = { startTime: Date; endTime: Date }

/** A working window in clinic wall time ("HH:MM"). */
export type TimeWindow = { start: string; end: string }

type SlotRules = Pick<ClinicSettings, "businessHours" | "lunchBreak" | "holidays" | "bookingPolicy" | "timezone">

export type SlotIssue =
  | "invalid_date" | "invalid_time" | "past" | "too_soon" | "too_far" | "holiday" | "closed"
  | "outside_hours" | "lunch" | "provider_off" | "blocked" | "conflict"

export type SlotCheck =
  | { ok: true; startUtc: Date; endUtc: Date }
  | { ok: false; reason: SlotIssue; detail?: string }

export type SlotParams = {
  date: string
  time: string
  durationMinutes: number
  bufferMinutes?: number
  rules: SlotRules
  booked: BookedInterval[]
  now: Date
  enforceNotice: boolean
  /** The dentist's working windows that day; null/undefined = whenever the clinic is open. */
  providerWindows?: TimeWindow[] | null
  /** Blocked time (personal time, vacation, whole-clinic closures) — busy without buffer. */
  blocks?: BookedInterval[]
}

function overlaps(booked: BookedInterval[], start: Date, end: Date): boolean {
  return booked.some((a) => a.startTime < end && a.endTime > start)
}

/** A dentist's windows on a date, or null when they follow the clinic's hours. */
export function providerWindowsOn(date: string, provider: Pick<Provider, "workingHours"> | null | undefined): TimeWindow[] | null {
  if (!provider?.workingHours) return null
  const wd = weekdayOf(date)
  return provider.workingHours.filter((w) => w.weekday === wd).map(({ start, end }) => ({ start, end }))
}

/**
 * Every reason an appointment of `durationMinutes` can't start at `time` on `date`
 * (clinic wall time), in the order a person would explain them. Pure.
 * `startUtc`/`endUtc` are null only when the date or time is unreadable.
 */
export function slotIssues(params: SlotParams): { startUtc: Date | null; endUtc: Date | null; issues: { reason: SlotIssue; detail?: string }[] } {
  const { date, time, durationMinutes, rules, booked, now, enforceNotice } = params
  const buffer = params.bufferMinutes ?? 0
  if (!isValidDateString(date)) return { startUtc: null, endUtc: null, issues: [{ reason: "invalid_date" }] }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { startUtc: null, endUtc: null, issues: [{ reason: "invalid_time" }] }

  const issues: { reason: SlotIssue; detail?: string }[] = []
  const today = todayInZone(rules.timezone, now)
  if (date < today) issues.push({ reason: "past" })
  if (date > addDays(today, rules.bookingPolicy.maxDaysAhead)) issues.push({ reason: "too_far" })

  const holiday = closureOn(date, rules.holidays)
  if (holiday) issues.push({ reason: "holiday", detail: holiday })

  const s = toMinutes(time)
  const e = s + durationMinutes
  const hours = hoursFor(date, rules.businessHours)
  if (!hours) issues.push({ reason: "closed" })
  else if (s < toMinutes(hours.open) || e > toMinutes(hours.close)) issues.push({ reason: "outside_hours" })
  if (rules.lunchBreak.enabled && s < toMinutes(rules.lunchBreak.end) && e > toMinutes(rules.lunchBreak.start)) {
    issues.push({ reason: "lunch" })
  }
  const windows = params.providerWindows
  if (windows && !windows.some((w) => s >= toMinutes(w.start) && e <= toMinutes(w.end))) {
    issues.push({ reason: "provider_off" })
  }

  const startUtc = zonedTimeToUtc(date, time, rules.timezone)
  const endUtc = new Date(startUtc.getTime() + durationMinutes * 60_000)
  if (date >= today && startUtc.getTime() <= now.getTime()) issues.push({ reason: "past" })
  if (enforceNotice && startUtc.getTime() > now.getTime() && startUtc.getTime() < now.getTime() + rules.bookingPolicy.minNoticeMinutes * 60_000) {
    issues.push({ reason: "too_soon" })
  }
  if (params.blocks && overlaps(params.blocks, startUtc, endUtc)) issues.push({ reason: "blocked" })
  if (overlaps(booked, startUtc, new Date(endUtc.getTime() + buffer * 60_000))) issues.push({ reason: "conflict" })
  return { startUtc, endUtc, issues }
}

/** Can the appointment start there? First reason if not. Pure. */
export function checkSlot(params: SlotParams): SlotCheck {
  const r = slotIssues(params)
  if (r.issues.length > 0) return { ok: false, ...r.issues[0] }
  return { ok: true, startUtc: r.startUtc!, endUtc: r.endUtc! }
}

/** All free slots of a day on the policy's slot grid. Pure. */
export function computeDaySlots(params: Omit<SlotParams, "time">): { slots: AvailabilitySlot[]; closedReason: string | null } {
  const { date, durationMinutes, rules } = params
  if (!isValidDateString(date)) return { slots: [], closedReason: "invalid_date" }

  const today = todayInZone(rules.timezone, params.now)
  if (date < today) return { slots: [], closedReason: "past" }
  if (date > addDays(today, rules.bookingPolicy.maxDaysAhead)) return { slots: [], closedReason: "too_far" }
  const holiday = closureOn(date, rules.holidays)
  if (holiday) return { slots: [], closedReason: holiday }
  const hours = hoursFor(date, rules.businessHours)
  if (!hours) return { slots: [], closedReason: "closed" }
  if (params.providerWindows && params.providerWindows.length === 0) return { slots: [], closedReason: "provider_off" }

  const step = rules.bookingPolicy.slotMinutes
  const slots: AvailabilitySlot[] = []
  for (let s = toMinutes(hours.open); s + durationMinutes <= toMinutes(hours.close); s += step) {
    const time = minutesToHHMM(s)
    const check = checkSlot({ ...params, time })
    if (check.ok) slots.push({ startTime: time, endTime: minutesToHHMM(s + durationMinutes) })
  }
  return { slots, closedReason: null }
}

export const INACTIVE_STATUSES = ["CANCELLED", "NO_SHOW", "RESCHEDULED"] as const

type Db = Pick<typeof prisma, "appointment" | "calendarBlock">

/**
 * Busy time of one dentist on a clinic day: their appointments plus any appointment with no
 * dentist recorded (conservative — legacy rows block everyone), each extended by its type's
 * buffer. Without `providerId`, every appointment counts (clinic treated as one chair).
 */
export async function busyFor(
  db: Db,
  date: string,
  settings: Pick<ClinicSettings, "timezone" | "appointmentTypes">,
  opts: { providerId?: string | null; excludeAppointmentId?: string } = {},
): Promise<{ booked: BookedInterval[]; blocks: BookedInterval[] }> {
  const { start, end } = dayBoundsUtc(date, settings.timezone)
  const [appts, blocks] = await Promise.all([
    db.appointment.findMany({
      where: {
        startTime: { lt: end },
        endTime: { gt: start },
        status: { notIn: [...INACTIVE_STATUSES] },
        ...(opts.providerId && { OR: [{ providerId: opts.providerId }, { providerId: null }] }),
        ...(opts.excludeAppointmentId && { id: { not: opts.excludeAppointmentId } }),
      },
      select: { startTime: true, endTime: true, type: true },
    }),
    db.calendarBlock.findMany({
      where: {
        startTime: { lt: end },
        endTime: { gt: start },
        ...(opts.providerId ? { OR: [{ providerId: opts.providerId }, { providerId: null }] } : { providerId: null }),
      },
      select: { startTime: true, endTime: true },
    }),
  ])
  const bufferOf = (type: string) => settings.appointmentTypes.find((t) => t.type === type)?.bufferMinutes ?? 0
  return {
    booked: appts.map((a) => ({ startTime: a.startTime, endTime: new Date(a.endTime.getTime() + bufferOf(a.type) * 60_000) })),
    blocks,
  }
}

/** Booked (non-cancelled) appointments overlapping a clinic day. */
export async function bookedIntervalsFor(
  date: string,
  timeZone: string,
  opts: { provider?: string; excludeAppointmentId?: string } = {},
): Promise<BookedInterval[]> {
  const { start, end } = dayBoundsUtc(date, timeZone)
  return prisma.appointment.findMany({
    where: {
      startTime: { lt: end },
      endTime: { gt: start },
      status: { notIn: [...INACTIVE_STATUSES] },
      ...(opts.provider && { provider: { equals: opts.provider, mode: "insensitive" } }),
      ...(opts.excludeAppointmentId && { id: { not: opts.excludeAppointmentId } }),
    },
    select: { startTime: true, endTime: true },
  })
}

/** Shared slot algorithm used by the staff API and the voice agent. */
export async function getDayAvailability(params: {
  date: string
  provider?: string
  providerId?: string
  duration?: number
  bufferMinutes?: number
  enforceNotice?: boolean
  settings?: ClinicSettings
  now?: Date
}): Promise<DayAvailability> {
  const settings = params.settings ?? (await getClinicSettings())
  const duration = params.duration && params.duration > 0 ? params.duration : settings.bookingPolicy.slotMinutes
  const provider = params.providerId ? settings.providers.find((p) => p.id === params.providerId) ?? null : null
  let booked: BookedInterval[] = []
  let blocks: BookedInterval[] = []
  if (isValidDateString(params.date)) {
    if (provider) {
      ;({ booked, blocks } = await busyFor(prisma, params.date, settings, { providerId: provider.id }))
    } else {
      booked = await bookedIntervalsFor(params.date, settings.timezone, { provider: params.provider })
    }
  }
  const { slots, closedReason } = computeDaySlots({
    date: params.date,
    durationMinutes: duration,
    bufferMinutes: params.bufferMinutes,
    rules: settings,
    booked,
    blocks,
    providerWindows: provider ? providerWindowsOn(params.date, provider) : null,
    now: params.now ?? new Date(),
    enforceNotice: params.enforceNotice ?? false,
  })
  return { date: params.date, provider: provider?.name ?? params.provider ?? null, availableSlots: slots, closedReason }
}

export function addDaysToDateString(dateStr: string, days: number): string {
  return addDays(dateStr, days)
}
