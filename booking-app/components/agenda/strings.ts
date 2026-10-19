// All agenda labels in one place (staff UI). Patient-facing text lives in lib/appointments/messages.ts.

export const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Booked",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
  RESCHEDULED: "Rescheduled",
}

export const SOURCE_LABEL: Record<string, string> = {
  STAFF: "Desk",
  VOICE_AGENT: "Acácia (AI)",
  CHATBOT: "Website chat",
  WEBSITE: "Online",
  WALK_IN: "Walk-in",
  PATIENT_LINK: "Patient link",
  IMPORT: "Imported (Zappy)",
}

export const REMINDER_LABEL: Record<string, string> = {
  none: "No reminder planned",
  pending: "Reminder scheduled",
  sent: "Reminder sent",
  delivered: "Reminder delivered",
  failed: "Reminder failed — check the number",
}

export const ISSUE_LABEL: Record<string, string> = {
  invalid_date: "Invalid date",
  invalid_time: "Invalid time",
  past: "This time has already passed",
  too_soon: "Less than the minimum notice",
  too_far: "Beyond the booking horizon",
  holiday: "The clinic is closed (holiday)",
  closed: "The clinic is closed that day",
  outside_hours: "Outside opening hours",
  lunch: "During the lunch break",
  provider_off: "The dentist is not working at this time",
  blocked: "This time is blocked",
  conflict: "The dentist already has an appointment then",
}

export const EVENT_LABEL: Record<string, string> = {
  CREATED: "Booked",
  RESCHEDULED: "Moved",
  UPDATED: "Edited",
  CANCELLED: "Cancelled",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Arrived",
  CHECK_IN_UNDONE: "Arrival undone",
  COMPLETED: "Completed",
  NO_SHOW: "No-show",
  SCHEDULED: "Re-opened",
  NOTIFICATION_SENT: "Message sent",
  NOTIFICATION_DELIVERED: "Message delivered",
  NOTIFICATION_FAILED: "Message failed",
  RESCHEDULE_REQUESTED: "Patient asked to reschedule",
}

export const NOTIFICATION_LABEL: Record<string, string> = {
  CONFIRMATION: "Booking confirmation",
  REMINDER_DAY_BEFORE: "Day-before reminder",
  REMINDER_HOURS_BEFORE: "Same-day reminder",
  RESCHEDULED: "Change notice",
  CANCELLED: "Cancellation notice",
}

export const ACTOR_LABEL: Record<string, string> = {
  STAFF: "Staff",
  VOICE_AGENT: "Acácia",
  PATIENT: "Patient",
  SYSTEM: "System",
  IMPORT: "Import",
}

export const BLOCK_KIND_LABEL: Record<string, string> = {
  TIME_OFF: "Personal time",
  VACATION: "Vacation",
  MEETING: "Meeting / training",
  OTHER: "Blocked",
}
