// Shape of GET /api/patients/[id] as the record page uses it.

export type RecordAppointment = {
  id: string
  startTime: string
  endTime: string
  type: string
  status: string
  provider: string | null
  reason: string | null
  notes: string | null
  bookedVia: string
  checkedInAt: string | null
}

export type RecordNote = {
  id: string
  content: string
  noteType: "GENERAL" | "MEDICAL" | "ADMINISTRATIVE" | "FOLLOW_UP" | "ALERT"
  createdAt: string
  authorId: string
  author: { firstName: string; lastName: string; role: string } | null
}

export type PatientRecordData = {
  id: string
  firstName: string
  middleName: string | null
  lastName: string
  dateOfBirth: string | null
  birthDay: number | null
  birthMonth: number | null
  gender: "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY" | null
  phone: string | null
  phoneNote: string | null
  phone2: string | null
  phone2Note: string | null
  email: string | null
  address: string | null
  city: string | null
  zipCode: string | null
  nif: string | null
  invoiceName: string | null
  invoiceNotes: string | null
  referredBy: string | null
  clientSource: string | null
  tags: string[]
  allergies: string | null
  medications: string | null
  medicalNotes: string | null
  insuranceProvider: string | null
  insuranceId: string | null
  emergencyContact: string | null
  emergencyPhone: string | null
  parentName: string | null
  parentRelation: string | null
  parentPhone: string | null
  parentEmail: string | null
  preferredLanguage: string | null
  preferredProvider: string | null
  smsRemindersEnabled: boolean
  emailRemindersEnabled: boolean
  consents: Record<string, boolean | string | null> | null
  externalId: string | null
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED" | "DRAFT"
  patientSince: string
  lastVisitAt: string | null
  totalVisits: number
  createdAt: string
  appointments: RecordAppointment[]
  callLogs: { id: string; startTime: string; duration: number | null; summary: string | null; outcome: string | null; intent?: string | null; hasRecording?: boolean }[]
  chatLogs: { id: string; startTime: string; topic: string | null; outcome: string | null }[]
  notes: RecordNote[]
  documents: { id: string; fileName: string; fileSize: number | null; createdAt: string; category?: string }[]
}

export type ClinicOptions = {
  types: Record<string, string>
  providers: { id: string; name: string }[]
}

export const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  SCHEDULED: { label: "Booked", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  CONFIRMED: { label: "Confirmed", cls: "bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900" },
  COMPLETED: { label: "Completed", cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900" },
  NO_SHOW: { label: "No-show", cls: "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900" },
  CANCELLED: { label: "Cancelled", cls: "bg-slate-50 text-slate-500 line-through dark:bg-slate-800/60" },
  RESCHEDULED: { label: "Rescheduled", cls: "bg-slate-50 text-slate-500 dark:bg-slate-800/60" },
}

export const NOTE_TYPE_LABEL: Record<RecordNote["noteType"], string> = {
  GENERAL: "Note",
  MEDICAL: "Clinical",
  ADMINISTRATIVE: "Admin",
  FOLLOW_UP: "Follow-up",
  ALERT: "Alert",
}

/** Imported notes start with this prefix (lib/import/zappyImport.ts). */
export const ZAPPY_NOTE_PREFIX = "Importado do Zappy: "

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", ...opts }).format(new Date(iso))
}

export function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
}

export function ageFrom(dob: string, now = new Date()): number {
  const b = new Date(dob)
  let a = now.getUTCFullYear() - b.getUTCFullYear()
  if (now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())) a--
  return a
}

export function phoneLabel(raw: string): string {
  const m = /^\+351(\d{3})(\d{3})(\d{3})$/.exec(raw)
  return m ? `${m[1]} ${m[2]} ${m[3]}` : raw
}

/** "zappy:3068" → "3068"; keyless imports have no visible number. */
export function zappyNumber(externalId: string | null): string | null {
  if (!externalId?.startsWith("zappy:")) return null
  const rest = externalId.slice(6)
  return /^(c|h|n|next):/.test(rest) ? null : rest
}
