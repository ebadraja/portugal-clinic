/**
 * Typed clinic configuration stored in the singleton `Settings` row.
 *
 * The JSON columns (businessHours, lunchBreak, holidays, appointmentTypes,
 * bookingPolicy, providers, insurers, clinicIdentity) are validated here, once.
 * A malformed stored value falls back to the default and is reported in
 * `warnings` so the System Status tab can show it — it never crashes a call.
 *
 * Defaults are the confirmed facts for Clínica Dentária Nunes Monteiro
 * (dental-website/website-requirements.md §1).
 */
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { DEFAULT_LOCALE, DEFAULT_TIMEZONE, addDays, weekdayOf } from '@/lib/clinic/time'

// ─── Schemas ─────────────────────────────────────────────────────────────────

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)')
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
export type DayName = (typeof DAY_NAMES)[number]

export const BusinessHourSchema = z
  .object({
    day: z.enum(DAY_NAMES),
    enabled: z.boolean(),
    open: HHMM,
    close: HHMM,
  })
  .refine((h) => !h.enabled || h.open < h.close, { message: 'Opening time must be before closing time' })

export const BusinessHoursSchema = z
  .array(BusinessHourSchema)
  .length(7)
  .refine((rows) => new Set(rows.map((r) => r.day)).size === 7, { message: 'Each day must appear once' })

export const LunchBreakSchema = z
  .object({ enabled: z.boolean(), start: HHMM, end: HHMM })
  .refine((l) => !l.enabled || l.start < l.end, { message: 'Break start must be before break end' })

export const HolidaySchema = z.object({ date: DATE, name: z.string().trim().min(1).max(80) })
export const HolidaysSchema = z.object({
  observeNationalHolidays: z.boolean(),
  closures: z.array(HolidaySchema).max(200),
})

export const APPOINTMENT_TYPE_KEYS = [
  'EVALUATION', 'HYGIENE', 'RESTORATIVE', 'ENDODONTICS', 'IMPLANT', 'ORTHODONTICS',
  'AESTHETICS', 'SURGERY', 'EMERGENCY', 'FOLLOW_UP', 'CONSULTATION', 'PROCEDURE', 'OTHER',
] as const
export type AppointmentTypeKey = (typeof APPOINTMENT_TYPE_KEYS)[number]

export const AppointmentTypeConfigSchema = z.object({
  type: z.enum(APPOINTMENT_TYPE_KEYS),
  label: z.string().trim().min(1).max(60),
  durationMinutes: z.number().int().min(5).max(480),
  bufferMinutes: z.number().int().min(0).max(120),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  agentBookable: z.boolean(),
  active: z.boolean(),
  priceFromEur: z.number().min(0).max(100_000).nullable(),
})
export const AppointmentTypesSchema = z
  .array(AppointmentTypeConfigSchema)
  .refine((rows) => new Set(rows.map((r) => r.type)).size === rows.length, { message: 'Each appointment type may appear once' })

export const BookingPolicySchema = z.object({
  /** "callback": the agent takes details and staff confirm capacity before booking. */
  newPatientMode: z.enum(['callback', 'book']),
  cancellationNoticeHours: z.number().int().min(0).max(168),
  lateToleranceMinutes: z.number().int().min(0).max(60),
  recallMonths: z.number().int().min(1).max(36),
  slotMinutes: z.number().int().min(5).max(120),
  minNoticeMinutes: z.number().int().min(0).max(7 * 24 * 60),
  maxDaysAhead: z.number().int().min(1).max(365),
})

/** One working window of a dentist on a weekday (0 = Sunday … 6 = Saturday). Several rows = split shift. */
export const WorkingWindowSchema = z
  .object({ weekday: z.number().int().min(0).max(6), start: HHMM, end: HHMM })
  .refine((w) => w.start < w.end, { message: 'Start must be before end' })

export const ProviderSchema = z.object({
  id: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(80),
  title: z.string().trim().max(80),
  registrationNumber: z.string().trim().max(40),
  active: z.boolean(),
  // Agenda fields — defaults keep rows saved before they existed valid.
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2563eb'),
  /** null = works whenever the clinic is open. */
  workingHours: z.array(WorkingWindowSchema).max(42).nullable().default(null),
  /** Appointment types this person does; empty = all. */
  appointmentTypes: z.array(z.string().max(40)).max(40).default([]),
  /** Acácia may book with this person. */
  agentBookable: z.boolean().default(true),
  /** Staff login of this person ("my agenda"). */
  userId: z.string().max(60).nullable().default(null),
})
export const ProvidersSchema = z
  .array(ProviderSchema)
  .max(50)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, { message: 'Provider ids must be unique' })

export const InsurersSchema = z.object({
  accepted: z.array(z.string().trim().min(1).max(80)).max(100),
  notAccepted: z.array(z.string().trim().min(1).max(80)).max(100),
  note: z.string().trim().max(500),
})

const ReminderChannelsSchema = z.array(z.enum(['SMS', 'EMAIL'])).max(2)

export const ReminderPolicySchema = z.object({
  confirmation: z.object({ enabled: z.boolean(), channels: ReminderChannelsSchema }),
  dayBefore: z.object({ enabled: z.boolean(), sendAt: HHMM, channels: ReminderChannelsSchema }),
  hoursBefore: z.object({ enabled: z.boolean(), hours: z.number().int().min(1).max(12), channels: ReminderChannelsSchema }),
  changeNotices: z.object({ rescheduled: z.boolean(), cancelled: z.boolean(), channels: ReminderChannelsSchema }),
  /** Nothing is sent outside this window (clinic time). */
  quietHours: z.object({ start: HHMM, end: HHMM }).refine((q) => q.start < q.end, { message: 'Start must be before end' }),
  /** Replace accented letters in SMS so one message holds 160 characters instead of 70. */
  smsPlainCharacters: z.boolean(),
  /** SMS text per message kind; merge tags in {{double_braces}}. Empty = built-in default. */
  smsTemplates: z.object({
    CONFIRMATION: z.string().max(480),
    REMINDER_DAY_BEFORE: z.string().max(480),
    REMINDER_HOURS_BEFORE: z.string().max(480),
    RESCHEDULED: z.string().max(480),
    CANCELLED: z.string().max(480),
  }),
})

export const ClinicIdentitySchema = z.object({
  legalName: z.string().trim().max(120),
  nif: z.string().trim().max(20),
  ersNumber: z.string().trim().max(40),
  omdNumbers: z.array(z.string().trim().min(1).max(40)).max(20),
  complaintsBookUrl: z.string().trim().max(200),
})

export type BusinessHour = z.infer<typeof BusinessHourSchema>
export type LunchBreak = z.infer<typeof LunchBreakSchema>
export type Holidays = z.infer<typeof HolidaysSchema>
export type AppointmentTypeConfig = z.infer<typeof AppointmentTypeConfigSchema>
export type BookingPolicy = z.infer<typeof BookingPolicySchema>
export type Provider = z.infer<typeof ProviderSchema>
export type Insurers = z.infer<typeof InsurersSchema>
export type ClinicIdentity = z.infer<typeof ClinicIdentitySchema>
export type WorkingWindow = z.infer<typeof WorkingWindowSchema>
export type ReminderPolicy = z.infer<typeof ReminderPolicySchema>
export type NotificationKind = keyof ReminderPolicy['smsTemplates']

// ─── Defaults (confirmed clinic facts) ───────────────────────────────────────

export const DEFAULT_BUSINESS_HOURS: BusinessHour[] = DAY_NAMES.map((day) => ({
  day,
  enabled: day !== 'Saturday' && day !== 'Sunday',
  open: '09:30',
  close: '18:00',
}))

export const DEFAULT_LUNCH_BREAK: LunchBreak = { enabled: true, start: '12:30', end: '14:00' }

export const DEFAULT_HOLIDAYS: Holidays = { observeNationalHolidays: true, closures: [] }

export const DEFAULT_APPOINTMENT_TYPES: AppointmentTypeConfig[] = [
  { type: 'EVALUATION',   label: 'Consulta de avaliação', durationMinutes: 30, bufferMinutes: 0,  color: '#2563eb', agentBookable: true,  active: true, priceFromEur: 45 },
  { type: 'HYGIENE',      label: 'Higiene oral',          durationMinutes: 45, bufferMinutes: 0,  color: '#10b981', agentBookable: true,  active: true, priceFromEur: 45 },
  { type: 'FOLLOW_UP',    label: 'Consulta de controlo',  durationMinutes: 30, bufferMinutes: 0,  color: '#6366f1', agentBookable: true,  active: true, priceFromEur: null },
  { type: 'EMERGENCY',    label: 'Urgência',              durationMinutes: 30, bufferMinutes: 0,  color: '#ef4444', agentBookable: false, active: true, priceFromEur: null },
  { type: 'RESTORATIVE',  label: 'Tratamento restaurador', durationMinutes: 60, bufferMinutes: 10, color: '#f59e0b', agentBookable: false, active: true, priceFromEur: null },
  { type: 'ENDODONTICS',  label: 'Endodontia',            durationMinutes: 60, bufferMinutes: 10, color: '#8b5cf6', agentBookable: false, active: true, priceFromEur: null },
  { type: 'IMPLANT',      label: 'Implantologia',         durationMinutes: 90, bufferMinutes: 15, color: '#0ea5e9', agentBookable: false, active: true, priceFromEur: null },
  { type: 'ORTHODONTICS', label: 'Ortodontia',            durationMinutes: 30, bufferMinutes: 0,  color: '#14b8a6', agentBookable: false, active: true, priceFromEur: null },
  { type: 'AESTHETICS',   label: 'Estética dentária',     durationMinutes: 60, bufferMinutes: 10, color: '#ec4899', agentBookable: false, active: true, priceFromEur: null },
  { type: 'SURGERY',      label: 'Cirurgia oral',         durationMinutes: 60, bufferMinutes: 15, color: '#dc2626', agentBookable: false, active: true, priceFromEur: null },
  { type: 'CONSULTATION', label: 'Consulta',              durationMinutes: 30, bufferMinutes: 0,  color: '#64748b', agentBookable: false, active: false, priceFromEur: null },
  { type: 'PROCEDURE',    label: 'Procedimento',          durationMinutes: 60, bufferMinutes: 0,  color: '#78716c', agentBookable: false, active: false, priceFromEur: null },
  { type: 'OTHER',        label: 'Outro',                 durationMinutes: 30, bufferMinutes: 0,  color: '#94a3b8', agentBookable: false, active: true, priceFromEur: null },
]

export const DEFAULT_BOOKING_POLICY: BookingPolicy = {
  newPatientMode: 'callback',
  cancellationNoticeHours: 24,
  lateToleranceMinutes: 15,
  recallMonths: 6,
  slotMinutes: 30,
  minNoticeMinutes: 60,
  maxDaysAhead: 90,
}

export const DEFAULT_PROVIDERS: Provider[] = [
  {
    id: 'ana-nunes', name: 'Dra. Ana Nunes', title: 'Médica Dentista', registrationNumber: '', active: true,
    color: '#2563eb', workingHours: null, appointmentTypes: [], agentBookable: true, userId: null,
  },
]

/** pt-PT, plain characters (see smsPlainCharacters), no clinical details — GDPR minimum. */
export const DEFAULT_SMS_TEMPLATES: ReminderPolicy['smsTemplates'] = {
  CONFIRMATION: '{{clinica}}: consulta marcada para {{data}} as {{hora}}. Confirme ou desmarque: {{link}}',
  REMINDER_DAY_BEFORE: '{{clinica}}: lembrete da sua consulta amanha, {{data}}, as {{hora}}. Confirme ou desmarque: {{link}}',
  REMINDER_HOURS_BEFORE: '{{clinica}}: a sua consulta e hoje as {{hora}}. Ate ja! Duvidas: {{telefone_clinica}}',
  RESCHEDULED: '{{clinica}}: a sua consulta foi alterada para {{data}} as {{hora}}. Detalhes: {{link}}',
  CANCELLED: '{{clinica}}: a sua consulta de {{data}} as {{hora}} foi desmarcada. Para remarcar ligue {{telefone_clinica}}.',
}

export const DEFAULT_REMINDER_POLICY: ReminderPolicy = {
  confirmation: { enabled: true, channels: ['SMS', 'EMAIL'] },
  dayBefore: { enabled: true, sendAt: '10:00', channels: ['SMS', 'EMAIL'] },
  hoursBefore: { enabled: false, hours: 3, channels: ['SMS'] },
  changeNotices: { rescheduled: true, cancelled: true, channels: ['SMS', 'EMAIL'] },
  quietHours: { start: '09:00', end: '20:00' },
  smsPlainCharacters: true,
  smsTemplates: { CONFIRMATION: '', REMINDER_DAY_BEFORE: '', REMINDER_HOURS_BEFORE: '', RESCHEDULED: '', CANCELLED: '' },
}

export const DEFAULT_INSURERS: Insurers = {
  accepted: ['AdvanceCare', 'RNA-ADE', 'Liga dos Combatentes'],
  notAccepted: ['SNS Cheque-Dentista'],
  note: 'Pagamento: cartão de débito/crédito, numerário, transferência bancária ou Scalapay.',
}

export const DEFAULT_PRACTICE = {
  name: 'Clínica Dentária Nunes Monteiro',
  tagline: 'Clínica Dentária — Malveira',
  phone: '928 494 871',
  email: 'geral@clinicadentariaih.com',
  address: 'Rua Miguel Judicibus Ferreira 29A, Malveira',
  website: 'https://clinicadentariaih.com',
}

export const DEFAULT_IDENTITY: ClinicIdentity = {
  legalName: 'Clínica Dentária Nunes Monteiro',
  nif: '',
  ersNumber: '',
  omdNumbers: [],
  complaintsBookUrl: 'https://www.livroreclamacoes.pt',
}

// ─── Portuguese national holidays ────────────────────────────────────────────

/** Gregorian Easter Sunday (Anonymous Gregorian algorithm). */
export function easterSunday(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Mandatory national holidays in Portugal (Código do Trabalho, art. 234). Municipal holidays are added as closures. */
export function portugueseNationalHolidays(year: number): { date: string; name: string }[] {
  const easter = easterSunday(year)
  const fixed: [string, string][] = [
    ['01-01', 'Ano Novo'],
    ['04-25', 'Dia da Liberdade'],
    ['05-01', 'Dia do Trabalhador'],
    ['06-10', 'Dia de Portugal'],
    ['08-15', 'Assunção de Nossa Senhora'],
    ['10-05', 'Implantação da República'],
    ['11-01', 'Dia de Todos-os-Santos'],
    ['12-01', 'Restauração da Independência'],
    ['12-08', 'Imaculada Conceição'],
    ['12-25', 'Natal'],
  ]
  return [
    ...fixed.map(([md, name]) => ({ date: `${year}-${md}`, name })),
    { date: addDays(easter, -2), name: 'Sexta-feira Santa' },
    { date: easter, name: 'Páscoa' },
    { date: addDays(easter, 60), name: 'Corpo de Deus' },
  ].sort((x, y) => x.date.localeCompare(y.date))
}

// ─── Parsing stored values ───────────────────────────────────────────────────

type Parsed<T> = { value: T; warning: string | null }

function parseOr<T>(schema: z.ZodType<T>, raw: unknown, fallback: T, label: string): Parsed<T> {
  if (raw === null || raw === undefined) return { value: fallback, warning: null }
  const result = schema.safeParse(raw)
  if (result.success) return { value: result.data, warning: null }
  return { value: fallback, warning: `${label}: stored value is invalid — using the default until it is saved again.` }
}

/** Legacy holidays were a bare string[] of dates. */
export function parseHolidays(raw: unknown): Parsed<Holidays> {
  if (Array.isArray(raw) && raw.every((d) => typeof d === 'string')) {
    const closures = (raw as string[]).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).map((date) => ({ date, name: 'Encerrado' }))
    return { value: { observeNationalHolidays: true, closures }, warning: null }
  }
  return parseOr(HolidaysSchema, raw, DEFAULT_HOLIDAYS, 'Holidays')
}

/** Older rows stored appointment types as [{id,name,duration,color,providers,buffer}] (pediatric) — ignore and use defaults. */
export function parseAppointmentTypes(raw: unknown): Parsed<AppointmentTypeConfig[]> {
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object' && raw[0] !== null && !('type' in raw[0])) {
    return { value: DEFAULT_APPOINTMENT_TYPES, warning: 'Appointment types: legacy (pediatric) format found — showing dental defaults until saved.' }
  }
  const parsed = parseOr(AppointmentTypesSchema, raw, DEFAULT_APPOINTMENT_TYPES, 'Appointment types')
  if (parsed.value.length === 0) return { value: DEFAULT_APPOINTMENT_TYPES, warning: null }
  return parsed
}

/** Business hours are stored as 7 rows; tolerate rows in any order or missing days. */
export function parseBusinessHours(raw: unknown): Parsed<BusinessHour[]> {
  if (!Array.isArray(raw)) return parseOr(BusinessHoursSchema, raw, DEFAULT_BUSINESS_HOURS, 'Business hours')
  const rows = DAY_NAMES.map((day) => {
    const found = (raw as unknown[]).find(
      (r) => typeof r === 'object' && r !== null && String((r as { day?: unknown }).day).toLowerCase() === day.toLowerCase(),
    )
    return found ? { ...(found as object), day } : { day, enabled: false, open: '09:00', close: '17:00' }
  })
  return parseOr(BusinessHoursSchema, rows, DEFAULT_BUSINESS_HOURS, 'Business hours')
}

// ─── The loaded configuration ────────────────────────────────────────────────

export type SettingsRowLike = {
  practiceName?: string | null
  practiceTagline?: string | null
  practicePhone?: string | null
  practiceEmail?: string | null
  practiceAddress?: string | null
  practiceWebsite?: string | null
  timezone?: string | null
  locale?: string | null
  businessHours?: unknown
  lunchBreak?: unknown
  holidays?: unknown
  appointmentTypes?: unknown
  bookingPolicy?: unknown
  providers?: unknown
  insurers?: unknown
  clinicIdentity?: unknown
  reminderPolicy?: unknown
  agendaV2Enabled?: boolean | null
  remindersEnabled?: boolean | null
  voiceAgentEnabled?: boolean | null
  voiceToolsPaused?: boolean | null
  voiceAgentName?: string | null
  greetingMessage?: string | null
  emergencyPhone?: string | null
}

export type ClinicSettings = {
  practice: { name: string; tagline: string; phone: string; email: string; address: string; website: string }
  timezone: string
  locale: string
  businessHours: BusinessHour[]
  lunchBreak: LunchBreak
  holidays: Holidays
  appointmentTypes: AppointmentTypeConfig[]
  bookingPolicy: BookingPolicy
  providers: Provider[]
  insurers: Insurers
  identity: ClinicIdentity
  reminderPolicy: ReminderPolicy
  /** Feature flags (Settings → System). */
  flags: { agendaV2: boolean; reminders: boolean }
  voiceAgent: { enabled: boolean; paused: boolean; name: string; greeting: string; transferPhone: string }
  warnings: string[]
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function buildClinicSettings(row: SettingsRowLike | null | undefined): ClinicSettings {
  const r = row ?? {}
  const warnings: string[] = []
  const take = <T>(p: Parsed<T>): T => {
    if (p.warning) warnings.push(p.warning)
    return p.value
  }

  let timezone = r.timezone || DEFAULT_TIMEZONE
  if (!isValidTimeZone(timezone)) {
    warnings.push(`Timezone "${timezone}" is not valid — using ${DEFAULT_TIMEZONE}.`)
    timezone = DEFAULT_TIMEZONE
  }

  return {
    practice: {
      name: r.practiceName || DEFAULT_PRACTICE.name,
      tagline: r.practiceTagline || DEFAULT_PRACTICE.tagline,
      phone: r.practicePhone || DEFAULT_PRACTICE.phone,
      email: r.practiceEmail || DEFAULT_PRACTICE.email,
      address: r.practiceAddress || DEFAULT_PRACTICE.address,
      website: r.practiceWebsite || DEFAULT_PRACTICE.website,
    },
    timezone,
    locale: r.locale || DEFAULT_LOCALE,
    businessHours: take(parseBusinessHours(r.businessHours)),
    lunchBreak: take(parseOr(LunchBreakSchema, r.lunchBreak, DEFAULT_LUNCH_BREAK, 'Lunch break')),
    holidays: take(parseHolidays(r.holidays)),
    appointmentTypes: take(parseAppointmentTypes(r.appointmentTypes)),
    bookingPolicy: take(parseOr(BookingPolicySchema, r.bookingPolicy, DEFAULT_BOOKING_POLICY, 'Booking policy')),
    providers: take(parseOr(ProvidersSchema, r.providers, DEFAULT_PROVIDERS, 'Providers')),
    insurers: take(parseOr(InsurersSchema, r.insurers, DEFAULT_INSURERS, 'Insurers')),
    identity: take(parseOr(ClinicIdentitySchema, r.clinicIdentity, DEFAULT_IDENTITY, 'Clinic identity')),
    reminderPolicy: take(parseOr(ReminderPolicySchema, r.reminderPolicy, DEFAULT_REMINDER_POLICY, 'Reminder policy')),
    flags: { agendaV2: r.agendaV2Enabled ?? false, reminders: r.remindersEnabled ?? false },
    voiceAgent: {
      enabled: r.voiceAgentEnabled ?? false,
      paused: r.voiceToolsPaused ?? false,
      name: r.voiceAgentName || 'Acácia',
      greeting: r.greetingMessage ?? '',
      transferPhone: r.emergencyPhone || r.practicePhone || DEFAULT_PRACTICE.phone,
    },
    warnings,
  }
}

/** Reads and validates the singleton Settings row. Never throws on bad JSON. */
export async function getClinicSettings(): Promise<ClinicSettings> {
  const row = await prisma.settings.findFirst()
  return buildClinicSettings(row)
}

// ─── Questions the booking engine asks ───────────────────────────────────────

/** Name of the holiday/closure on `dateStr`, or null when the clinic is open that day. */
export function closureOn(dateStr: string, holidays: Holidays): string | null {
  const custom = holidays.closures.find((c) => c.date === dateStr)
  if (custom) return custom.name
  if (holidays.observeNationalHolidays) {
    const year = Number(dateStr.slice(0, 4))
    const national = portugueseNationalHolidays(year).find((h) => h.date === dateStr)
    if (national) return national.name
  }
  return null
}

export function hoursFor(dateStr: string, hours: BusinessHour[]): BusinessHour | null {
  const day = DAY_NAMES[weekdayOf(dateStr)]
  const row = hours.find((h) => h.day === day)
  return row && row.enabled ? row : null
}

/** Active providers in display order. */
export function activeProviders(settings: Pick<ClinicSettings, 'providers'>): Provider[] {
  return settings.providers.filter((p) => p.active)
}

export function providerById(id: string | null | undefined, providers: Provider[]): Provider | null {
  if (!id) return null
  return providers.find((p) => p.id === id) ?? null
}

/** Legacy rows store only the provider's name. */
export function providerByName(name: string | null | undefined, providers: Provider[]): Provider | null {
  if (!name) return null
  const n = name.trim().toLowerCase()
  return providers.find((p) => p.name.trim().toLowerCase() === n) ?? null
}

/** Does this person do this appointment type? */
export function providerDoesType(provider: Provider, type: string): boolean {
  return provider.appointmentTypes.length === 0 || provider.appointmentTypes.includes(type)
}

export function appointmentTypeConfig(type: string, types: AppointmentTypeConfig[]): AppointmentTypeConfig | null {
  return types.find((t) => t.type === type) ?? null
}
