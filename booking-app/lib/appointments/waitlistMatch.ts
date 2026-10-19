// Which waiting-list entries suit a free slot. Import-free so the agenda can run it in the browser too.

export const TIMES_OF_DAY = ['ANY', 'MORNING', 'AFTERNOON'] as const
export type TimeOfDay = (typeof TIMES_OF_DAY)[number]
/** "Afternoon" starts at 13:00 clinic time. */
export const AFTERNOON_FROM = 13 * 60

export type SlotQuery = {
  date: string
  time: string
  durationMinutes: number
  providerId: string | null
}

export type MatchableEntry = {
  status: string
  type: string | null
  providerId: string | null
  fromDate: string
  untilDate: string | null
  timeOfDay: string
  /** Wall time of the booked appointment they want to bring forward, if it is still active. */
  currentStart: string | null
}

/** Does this free slot suit this waiting-list entry? Pure. */
export function entryFitsSlot(e: MatchableEntry, slot: SlotQuery, durationOf: (type: string) => number | null): boolean {
  if (e.status !== 'ACTIVE') return false
  if (slot.date < e.fromDate) return false
  if (e.untilDate && slot.date > e.untilDate) return false
  if (e.providerId && slot.providerId && e.providerId !== slot.providerId) return false
  const [h, m] = slot.time.split(':').map(Number)
  const start = h * 60 + m
  if (e.timeOfDay === 'MORNING' && start >= AFTERNOON_FROM) return false
  if (e.timeOfDay === 'AFTERNOON' && start < AFTERNOON_FROM) return false
  const needs = e.type ? durationOf(e.type) : null
  if (needs && needs > slot.durationMinutes) return false
  // Only an improvement counts: earlier than what they already have.
  if (e.currentStart && `${slot.date}T${slot.time}` >= e.currentStart) return false
  return true
}
