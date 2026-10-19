// Client-side mirror of lib/appointments/agenda.ts payloads (import-free so the bundle stays client-only).

export type AgendaStatus = "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW" | "RESCHEDULED"
export type ReminderState = "none" | "pending" | "sent" | "delivered" | "failed"

export type AgendaProvider = {
  id: string
  name: string
  title: string
  color: string
  active: boolean
  workingHours: { weekday: number; start: string; end: string }[] | null
  appointmentTypes: string[]
  agentBookable: boolean
  userId: string | null
}

export type AgendaType = { type: string; label: string; color: string; durationMinutes: number; active: boolean }

export type AgendaAppointment = {
  id: string
  patientId: string
  patientName: string
  patientPhone: string | null
  tags: string[]
  /** Clinic wall time "YYYY-MM-DDTHH:mm". */
  start: string
  end: string
  startUtc: string
  duration: number
  type: string
  status: AgendaStatus
  providerId: string | null
  provider: string | null
  reason: string | null
  notes: string | null
  bookedVia: string
  confirmedAt: string | null
  confirmedVia: string | null
  checkedInAt: string | null
  seriesId: string | null
  allowedOverlap: boolean
  reminder: ReminderState
  /** clinical: condition labels (Allergy, Anticoagulated…) from allergies, notes and tags. */
  alerts: { clinical: string[]; birthday: boolean; newPatient: boolean; dobMissing: boolean }
}

export type AgendaBlock = { id: string; providerId: string | null; start: string; end: string; kind: string; reason: string | null; seriesId: string | null }

export type AgendaPayload = {
  timezone: string
  locale: string
  from: string
  to: string
  serverTime: string
  today: string
  providers: AgendaProvider[]
  appointmentTypes: AgendaType[]
  businessHours: { day: string; enabled: boolean; open: string; close: string }[]
  lunchBreak: { enabled: boolean; start: string; end: string }
  slotMinutes: number
  closures: { date: string; name: string }[]
  appointments: AgendaAppointment[]
  blocks: AgendaBlock[]
}

export type AppointmentDetail = {
  id: string
  start: string
  end: string
  duration: number
  type: string
  status: AgendaStatus
  providerId: string | null
  provider: string | null
  reason: string | null
  notes: string | null
  bookedVia: string
  confirmedAt: string | null
  confirmedVia: string | null
  checkedInAt: string | null
  cancelReason: string | null
  seriesId: string | null
  allowedOverlap: boolean
  externalId: string | null
  createdAt: string
  createdBy: string | null
  patient: {
    id: string
    name: string
    phone: string | null
    phoneNote: string | null
    email: string | null
    tags: string[]
    alerts: { label: string; source: string }[]
    emailRemindersEnabled: boolean
    dateOfBirth: string | null
    allergies: string | null
    medicalAlert: string | null
    totalVisits: number
    lastVisitAt: string | null
    noShows: number
    nif: string | null
    smsRemindersEnabled: boolean
    importedFrom: string | null
  }
  upcoming: { id: string; start: string; type: string }[]
  callLog: { id: string; summary: string | null; hasRecording: boolean; at: string } | null
  events: { id: string; kind: string; actor: string; by: string | null; vapiCallId: string | null; data: Record<string, unknown> | null; at: string }[]
  notifications: { id: string; kind: string; channel: string; status: string; deliveryStatus: string | null; sendAt: string; sentAt: string | null; error: string | null }[]
}

export type PatientHit = {
  id: string
  name: string
  phone: string | null
  dateOfBirth: string | null
  preferredProvider: string | null
  totalVisits: number
  alerts: string[]
  appointments?: { id: string; start: string; type: string; status: AgendaStatus; provider: string | null }[]
}

export type Issue = { reason: string; detail?: string }

/** What the booking dialog was opened for. */
export type BookingDraft = {
  mode: "create" | "move"
  appointmentId?: string
  patient?: { id: string; name: string } | null
  date: string
  time: string
  providerId: string | null
  type?: string
  durationMinutes?: number
  notes?: string
  /** Booked from the waiting list: the entry is closed when the booking succeeds. */
  waitlistEntryId?: string
}

export type AgendaView = "day" | "week" | "month" | "list"

export type TimeOfDay = "ANY" | "MORNING" | "AFTERNOON"

export type WaitlistItem = {
  id: string
  patientId: string
  patientName: string
  patientPhone: string | null
  alerts: string[]
  type: string | null
  providerId: string | null
  fromDate: string
  untilDate: string | null
  timeOfDay: TimeOfDay
  notes: string | null
  status: string
  currentAppointmentId: string | null
  /** Wall time of the appointment they want to bring forward. */
  currentStart: string | null
  createdAt: string
}

/** /api/agenda/patients/[id]: the patient as the desk needs them while booking. */
export type PatientSnapshot = {
  id: string
  name: string
  phone: string | null
  phoneNote: string | null
  email: string | null
  dateOfBirth: string | null
  alerts: { label: string; source: string }[]
  tags: string[]
  totalVisits: number
  lastVisitAt: string | null
  noShows: number
  preferredProviderId: string | null
  upcoming: { id: string; start: string; type: string; provider: string | null; status: AgendaStatus }[]
  notes: { id: string; content: string; noteType: string; createdAt: string }[]
  waitlist: WaitlistItem | null
}
