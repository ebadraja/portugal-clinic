import prisma from "@/lib/prisma"

type BusinessHourEntry = { day: string; open: string; close: string; enabled: boolean }
type LunchBreak        = { start: string; end: string; enabled: boolean }

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export type AvailabilitySlot = { startTime: string; endTime: string }

export type DayAvailability = {
  date: string
  provider: string | null
  availableSlots: AvailabilitySlot[]
}

function toTotalMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

function minutesToHHMM(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** Shared slot algorithm used by staff API and GIGI chatbot availability. */
export async function getDayAvailability(params: {
  date: string
  provider?: string
  duration?: number
}): Promise<DayAvailability> {
  const { date: dateParam, provider: providerParam } = params
  const duration = params.duration && params.duration > 0 ? params.duration : 30

  const [year, month, day] = dateParam.split("-").map(Number)
  const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0)
  const dayEnd   = new Date(year, month - 1, day, 23, 59, 59, 999)
  const dayOfWeek = DAY_NAMES[dayStart.getDay()]

  const [settings, bookedAppointments] = await Promise.all([
    prisma.settings.findFirst({
      select: { businessHours: true, lunchBreak: true },
    }),
    prisma.appointment.findMany({
      where: {
        startTime: { gte: dayStart, lte: dayEnd },
        status:    { notIn: ["CANCELLED", "NO_SHOW"] },
        ...(providerParam && {
          provider: { equals: providerParam, mode: "insensitive" },
        }),
      },
      select: { startTime: true, endTime: true },
    }),
  ])

  const businessHours = settings?.businessHours as BusinessHourEntry[] | null
  const dayHours = businessHours?.find(
    (h) => h.day.toLowerCase() === dayOfWeek.toLowerCase()
  )

  if (!dayHours || !dayHours.enabled) {
    return {
      date: dateParam,
      provider: providerParam ?? null,
      availableSlots: [],
    }
  }

  const openMin  = toTotalMinutes(dayHours.open)
  const closeMin = toTotalMinutes(dayHours.close)

  const rawLunch   = settings?.lunchBreak as LunchBreak | null
  const lunch      = rawLunch ?? { start: "12:30", end: "13:00", enabled: true }
  const lunchStart = lunch.enabled ? toTotalMinutes(lunch.start) : -1
  const lunchEnd   = lunch.enabled ? toTotalMinutes(lunch.end)   : -1

  const now     = new Date()
  const isToday = (
    now.getFullYear() === year &&
    now.getMonth()    === month - 1 &&
    now.getDate()     === day
  )
  const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : -1

  const availableSlots: AvailabilitySlot[] = []

  for (let slotStart = openMin; slotStart + duration <= closeMin; slotStart += duration) {
    const slotEnd = slotStart + duration

    if (isToday && slotStart <= nowMinutes) continue
    if (lunch.enabled && slotStart < lunchEnd && slotEnd > lunchStart) continue

    const slotStartDate = new Date(year, month - 1, day, Math.floor(slotStart / 60), slotStart % 60, 0)
    const slotEndDate   = new Date(year, month - 1, day, Math.floor(slotEnd   / 60), slotEnd   % 60, 0)

    const isBooked = bookedAppointments.some(
      (appt) => appt.startTime < slotEndDate && appt.endTime > slotStartDate
    )

    if (!isBooked) {
      availableSlots.push({
        startTime: minutesToHHMM(slotStart),
        endTime:   minutesToHHMM(slotEnd),
      })
    }
  }

  return {
    date: dateParam,
    provider: providerParam ?? null,
    availableSlots,
  }
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00")
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
