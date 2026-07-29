type DayHours = {
  open: string
  close: string
  closed?: boolean
}

type BusinessHoursConfig = Partial<
  Record<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday', DayHours>
>

const DAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export function isWithinBusinessHours(
  config: BusinessHoursConfig | null | undefined,
  now = new Date(),
): boolean {
  if (!config || Object.keys(config).length === 0) return true

  const dayKey = DAY_KEYS[now.getDay()]
  const day = config[dayKey]
  if (!day || day.closed) return false

  const open = parseTimeToMinutes(day.open)
  const close = parseTimeToMinutes(day.close)
  if (open === null || close === null) return true

  const current = now.getHours() * 60 + now.getMinutes()
  if (close <= open) {
    return current >= open || current < close
  }
  return current >= open && current < close
}

export function getOfflineMessage(
  config: { offlineMessage?: string } | null | undefined,
): string {
  return (
    config?.offlineMessage ??
    'We are currently outside office hours. Leave a message and our team will respond on the next business day.'
  )
}
