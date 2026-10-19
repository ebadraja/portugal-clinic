// Client-side mirror of lib/clinic/settings.ts types (kept import-free so client bundles don't pull server code).

export type BusinessHour = { day: string; enabled: boolean; open: string; close: string };
export type LunchBreak = { enabled: boolean; start: string; end: string };
export type Holidays = { observeNationalHolidays: boolean; closures: { date: string; name: string }[] };
export type AppointmentTypeConfig = {
  type: string;
  label: string;
  durationMinutes: number;
  bufferMinutes: number;
  color: string;
  agentBookable: boolean;
  active: boolean;
  priceFromEur: number | null;
};
export type BookingPolicy = {
  newPatientMode: "callback" | "book";
  cancellationNoticeHours: number;
  lateToleranceMinutes: number;
  recallMonths: number;
  slotMinutes: number;
  minNoticeMinutes: number;
  maxDaysAhead: number;
};
export type WorkingWindow = { weekday: number; start: string; end: string };
export type Provider = {
  id: string;
  name: string;
  title: string;
  registrationNumber: string;
  active: boolean;
  color: string;
  /** null = works whenever the clinic is open */
  workingHours: WorkingWindow[] | null;
  /** empty = does every appointment type */
  appointmentTypes: string[];
  agentBookable: boolean;
  userId: string | null;
};
export type Insurers = { accepted: string[]; notAccepted: string[]; note: string };
export type ClinicIdentity = { legalName: string; nif: string; ersNumber: string; omdNumbers: string[]; complaintsBookUrl: string };

export type ClinicSettingsDto = {
  practice: { name: string; tagline: string; phone: string; email: string; address: string; website: string };
  timezone: string;
  locale: string;
  businessHours: BusinessHour[];
  lunchBreak: LunchBreak;
  holidays: Holidays;
  appointmentTypes: AppointmentTypeConfig[];
  bookingPolicy: BookingPolicy;
  providers: Provider[];
  insurers: Insurers;
  identity: ClinicIdentity;
  voiceAgent: { enabled: boolean; paused: boolean; name: string; greeting: string; transferPhone: string };
  warnings: string[];
  nationalHolidays?: { date: string; name: string }[];
};

export const DAY_LABEL: Record<string, string> = {
  Monday: "Monday",
  Tuesday: "Tuesday",
  Wednesday: "Wednesday",
  Thursday: "Thursday",
  Friday: "Friday",
  Saturday: "Saturday",
  Sunday: "Sunday",
};
export const WEEK_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
