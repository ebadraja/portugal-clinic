# Replacing Zappy: Agenda, Reminders and Data Migration Plan

**Date:** 19 Oct 2026 · **Scope:** `booking-app/` · **Status:** plan only, no code changed

**Goal:** The clinic (Clínica Dentária Nunes Monteiro) stops using Zappy. The CRM becomes the only
system for the practice. Inbound calls (Acácia, the voice agent) and staff at the desk book,
reschedule and cancel in **one agenda**. Patients get confirmations and reminders. All existing
Zappy data moves into the CRM.

---

## 0. Decisions at a glance

| # | Decision | Why |
|---|---|---|
| D1 | **The CRM database is the calendar.** No Google Calendar, no external calendar service. | One source of truth that the AI, staff and reminders all read and write. An external calendar adds a second source of truth, sync conflicts, OAuth tokens to expire, and patient data sent to a third party. Google Calendar's only real extras are UI and reminders, and we build both here. |
| D2 | **Calendar UI: `@event-calendar/core` (vkurko), MIT, free.** | It gives a day view with one column per dentist (and chair), week, month and list views, drag to move, resize, and select a range to book or block, all free. FullCalendar charges for the per-dentist columns (Premium, from US$480/yr). react-big-calendar also works but pulls in moment, globalize and luxon, and looks dated. |
| D3 | **One booking service** (`lib/appointments/booking.ts`) used by staff routes, voice tools, the patient confirmation page and the importer. | Today the staff route and the voice tools validate bookings differently (see §2). |
| D4 | **Reminders run from a database outbox** (`appointment_notifications`) sent by an idempotent `/api/cron/dispatch` endpoint. **No Redis or worker needed.** | Production is on Vercel, and the current reminder engine (BullMQ + Redis + `worker.ts`) can't run there. Today **no reminders are being sent**. |
| D5 | **Scheduler trigger: cron-job.org (free) every 10 min, 08:00–21:00 Lisbon**, plus a once-a-day Vercel Cron as a safety net. If the clinic is on Vercel Pro, use Vercel Cron alone. | Vercel Hobby allows only one cron run per day. The daytime-only window also keeps Neon's free compute quota (100 CU-hours/month) safe and never texts patients at night. |
| D6 | **Confirmation by link, not app.** The SMS or email carries a short signed link, `/c/<token>`, to a page with **Confirmo / Não posso ir / Quero remarcar** and "Add to calendar" (.ics / Google link). | Zappy only has confirm buttons in its push app. We give every patient one tap, without an app to install. |
| D7 | **Migration with a one-off script** (`scripts/import-zappy.ts`): dry-run report, idempotent upserts keyed by Zappy id, re-runnable for the delta at cutover. | It runs once for one clinic. A script with a reviewed report is safer and faster than building an import UI. |
| D8 | **Everything ships dark behind flags** (`agendaV2Enabled`, `remindersEnabled`) and every schema change is additive. | Nothing in production changes until we switch it on. |

---

## Implementation status (19 Oct 2026)

Phases 1–4 are built, with both feature switches off. The steps to go live are in
[cutover-runbook.md](cutover-runbook.md).

| Area | Where |
|---|---|
| Booking service (one set of rules for desk, Acácia, patient link, importer) | `lib/appointments/booking.ts`, `availability.ts` |
| Reminder planning, outbox, dispatcher, delivery reports | `lib/appointments/notifications.ts`, `dispatch.ts`, `messages.ts`, `/api/cron/dispatch`, `/api/webhooks/twilio/status` |
| Patient confirm/cancel/reschedule page and .ics | `/c/[token]`, `/api/public/appointment/[token]` |
| Agenda UI (per-dentist columns, drag & drop, booking, drawer, blocks, front-desk panel) | `components/agenda/*`, `/api/agenda/*` |
| Settings: dentists' hours, colours, services; Agenda & Reminders tab | `components/settings/PracticeSettingsTab.tsx`, `AgendaRemindersTab.tsx` |
| Attendance certificate | `/print/appointments/[id]/certificate` |
| Zappy importer | `scripts/import-zappy.ts`, `lib/import/*`, `scripts/zappy-map.example.json` |
| Waiting list (Phase 6 item, built early): patients who want a sooner time; freed times (cancellation, no-show, a selected free slot, "Free slots") list who fits, and booking from it moves their current appointment | `lib/appointments/waitlist.ts`, `waitlistMatch.ts`, `/api/agenda/waitlist`, `components/agenda/FrontDeskLists.tsx`, `WaitlistForm.tsx` |
| Check-up calls: front-desk list of patients due a check-up; logging the call (no answer / call back / not now / declined) hides them for 1 week–1 year and leaves a note | `/api/patients/[id]/recall`, `Patient.recallSnoozedUntil`, `FrontDeskLists.tsx` |
| Patient context while booking (alerts, last visit, what is already booked, latest note, usual dentist pre-selected) and patient notes in the appointment drawer | `/api/agenda/patients/[id]`, `PatientSnapshotCard.tsx` |

**Where the build differs from this plan (simpler):**
- **Dentists stay in `Settings.providers`** (validated JSON), extended with colour, working hours, types, AI-bookable and linked login. They don't move to a new `Provider` table. Every caller already loads that list, nothing needs backfilling, and appointments reference it through `providerId`.
- **Chairs/rooms are not built yet.** Each dentist's column is their chair, which is fine until the clinic confirms it shares chairs (§13).
- **Emails carry calendar links** (Google, plus an `.ics` download) instead of an `.ics` attachment. This avoids changing three email providers.
- **The staff UI is in English**, like the rest of the CRM. All agenda labels are in `components/agenda/strings.ts`. Patient-facing text (SMS, email, patient page, certificate) is in pt-PT.

---

## Zappy client export → CRM (real columns, 19 Oct)

Zappy's client export has 44 columns. Each one goes to a field the agenda or patient record actually
uses, or is deliberately dropped:

| Zappy column(s) | CRM field | Where it shows up / what it drives |
|---|---|---|
| `nr` | `externalId = zappy:<nr>` | Makes re-imports idempotent; shown as "from Zappy" in the record |
| `name`, `full_name` | `firstName`/`lastName` (from `name`; from `full_name` when `name` is just a first name), `invoiceName` = `full_name` when different | Everywhere; invoice name in the record |
| `mobile`, `phone_main_note` | `phone` (E.164), `phoneNote` | SMS reminders, tap-to-call, caller-ID match for Acácia |
| `phone_2`, `phone_2_note` | `phone2`, `phone2Note` | Record; used as the main phone when `mobile` is empty |
| `email` | `email` | Email reminders |
| `gender` | `gender` | Record |
| `birth_day`, `birth_month`, `birth_year` | `dateOfBirth` when all three are present; otherwise `birthDay`/`birthMonth` | Acácia's identity check needs the full date. The birthday 🎂 in the agenda works with day + month only |
| `vat_number` | `nif` (checksum-validated) | Search, invoices, certificate |
| `address`, `zipcode`, `city` | `address`, `zipCode`, `city` | Record, certificate |
| `segment_manual` | `tags[]` (one tag per segment) | Chips on the record and in the agenda drawer, patient-list filter. **Segments mentioning allergies, oncology, anticoagulants, heart, diabetes, pregnancy etc. raise a red clinical alert** on the agenda card and drawer. |
| `segment_automatic` | not stored — recomputed | Active / lost / never came / new are derived from visits (patient-list filter) |
| `crm_source`, `crm_referral`, `crm_referral_client_name` | `clientSource`, `referredBy` | Record; reports by origin |
| `obs_1`, `obs_2`, `obs_3` | Patient notes "Importado do Zappy" | Record → Notes |
| `invoice_obs` | `invoiceNotes` | Record |
| `crm_work`, `crm_next_step`, `crm_next_step_date` | A **callback task** (Callbacks page) when the step is dated within the last 60 days or in the future; otherwise a note | Follow-up queue |
| `loyaltycard_*` | Note when it has a value | (no loyalty module) |
| `data_protection_type_*` (8 consents), `RGPD_updated_on` | `consents` JSON + `smsRemindersEnabled`/`emailRemindersEnabled`; a campaigns refusal becomes an email unsubscribe | Reminders are only sent on channels the patient allowed; consent panel in the record |
| `createdon` | `patientSince` | Record, "new patient" filter |
| `last_appointment_date` | `lastVisitAt` (unless imported bookings give a later one) | Patient list, recall list |
| `next_appointment_date` | Checked against imported bookings. With `--create-next-from-clients`, creates the appointment when Zappy's booking list wasn't exported | Agenda |
| `online` | dropped | (My Zappy app account) |

---

## 1. What Zappy is, and which parts this clinic needs

Zappy (Brightech, Portugal) is cloud booking software built mainly for beauty and aesthetics. It
also has pages for physio, psychology and medical practices. There is no dental-specific
module (no odontogram, no chair-based workflow). The features it has, from zappysoftware.com:

| Zappy feature | What it does | CRM today | Plan |
|---|---|---|---|
| Agenda views | Day (staff side by side), week, per staff group, per room or equipment | Hand-built week/day/list grid, no columns per dentist | **Build** (§8): per-dentist and per-chair columns |
| Drag & drop, copy/paste | Move by dragging; copy for repeat sessions | None | **Build**: drag, resize, "Duplicate / next visit" |
| Colours | By staff, category or service | Colour per appointment type | **Build**: colour by type *or* by dentist (toggle) |
| Statuses + day symbols | Confirmed, Awaiting confirmation, Waiting list; Arrived, Paid, No-show | SCHEDULED, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW, RESCHEDULED | **Extend**: add "Arrived" (`checkedInAt`). Payment is out of scope |
| Recurring bookings | Daily or every X weeks | None | **Build** as a series of normal appointments (§6.4) |
| Blocks / days off / holidays | Personal time, vacations, national holidays | Clinic hours, lunch, PT holidays incl. Easter-based, closures | **Extend**: per-dentist hours + blocks (§5) |
| Online-booking marker (@) | Shows how a booking was made | `bookedVia` exists | **Build**: source icons (AI / staff / online / imported) |
| Internal notes, attachments, alerts | Notes; files; birthday, debt and pack alerts | Patient notes, documents, allergies | **Reuse** + show alerts on the appointment card |
| Attendance certificate | Declaração de presença, printed or emailed | None | **Build** (printable page, small) |
| Reminders | SMS 1–3 days before at a chosen time; optional hours-before; editable text; per-staff/service text; delivery report; green bell when delivered | Email + SMS engine exists but **cannot run on Vercel**; SMS only to portal-verified phones | **Rebuild** (§7) |
| Confirmation buttons | Push only: SIM/VOU, NÃO VOU, REAGENDAR | None | **Build** for everyone by link (D6) |
| Google Calendar invite | Patient gets an invite | None | **Build**: .ics attachment + "Add to Google Calendar" link |
| Online booking | Website, Instagram, rules per service/staff, notice periods, auto/manual approval | Voice agent + new-patient callback rule; website chatbot deferred | **Phase 6** (optional): same booking service, manual approval for new patients |
| Client record | Contacts, NIF validation, origin, segments, GDPR consents, history, no-show count, merge duplicates, CSV/Excel export | Rich patient record, GDPR export/erase, notes, docs, intake forms | **Extend**: NIF, origin, no-show count, "Nº cliente Zappy" |
| Staff | Hours, services per staff, access levels, colour, online-bookable | Providers are a JSON list (name only); roles ADMIN/STAFF/VIEWER | **Build** `Provider` table: hours, types, colour, AI-bookable |
| Reports | Appointment volume by service/staff/status, client sources, birthdays, SMS sent, consents | Reports page (calls, voice usage) | **Extend**: no-show and late-cancel rates, confirmation rate, source split, dentist utilisation, SMS sent/delivered |
| AI phone assistant | Answers when staff can't, books in free slots | **Acácia already does more**: verified identity, reschedule, cancel, callbacks, transfers, FAQ | **Align** with the new service (§9) |
| SMS/email campaigns, birthday SMS | Marketing | Email campaigns exist (worker-dependent) | Out of scope now (Phase 6+) |
| Packs, payments (MB WAY, Multibanco), cash, **certified invoicing (AT nº 2230, SAF-T)**, stock, commissions, loyalty | Billing side | None | **Out of scope — needs a client decision** (§13) |

**What actually matters for a dental clinic:** a fast agenda with a column per dentist,
reliable reminders with confirmation, AI and staff booking into the same slots, and the
patient history carried over. Billing is a separate decision, because certified invoicing
software in Portugal needs AT certification, and we must not build that.

---

## 2. Where the CRM stands today (code findings)

What we can build on:
- `lib/appointments/availability.ts`: a pure, tested slot engine (`checkSlot`, `computeDaySlots`) covering clinic hours, lunch, holidays, notice period, max days ahead and buffers, in Lisbon time and DST-safe (`lib/clinic/time.ts`).
- `lib/voice/tools.ts`: the voice agent books under a **per-day advisory lock** (`withDayLock`) and runs the full `checkSlot`. Reschedule moves the appointment in place, and cancel flags late notice.
- `lib/clinic/settings.ts`: typed, validated settings for appointment types (duration, buffer, colour, `agentBookable`), booking policy and providers.
- `lib/clinic/phone.ts` (PT/E.164), `lib/email/send.ts` (email without Redis), Twilio provider, SMS opt-out that outlives the record, audit log.

Gaps that would break a "whole practice runs on this" setup:

| # | Finding | Where | Effect |
|---|---|---|---|
| G1 | **Reminders never run in production.** They need `worker.ts` + Redis + node-cron on a long-running host, but production is Vercel. The retrofit report lists this as deferred. | `worker.ts`, `services/*Scheduler.ts`, `docs/retrofit/2026-10-18-overnight-report.md` | No reminders today. This is the main reason the clinic still needs Zappy. |
| G2 | **SMS reminders only go to portal-verified numbers** (pediatric HIPAA leftover). | `lib/messaging/automationSms.ts` → `getVerifiedPortalPhone` | Even with a worker running, patients imported from Zappy would get no SMS. |
| G3 | **Staff and AI booking rules differ.** Staff `POST` only checks overlap on the exact provider string, with no hours, lunch, holiday or lock. `PUT` checks nothing, so a drag or reschedule can double-book. The voice tools check everything, but treat the clinic as one chair (ignoring the dentist). | `app/api/appointments/route.ts`, `[id]/route.ts`, `lib/voice/tools.ts` | Double bookings between the desk and the AI; this breaks as soon as there are two dentists. |
| G4 | **The dentist is free text** (`Appointment.provider String?`) and providers are a JSON list with no hours. | `prisma/schema.prisma`, `Settings.providers` | No per-dentist availability or columns; renaming a dentist breaks matching. |
| G5 | **The list API caps at 100 rows**, and the calendar loads a week through it. | `GET /api/appointments` (`limit ≤ 100`) | A busy week silently drops appointments from the calendar. |
| G6 | **The Google Calendar overlay is pediatric** (WELL/SICK/BH parsing, read-only). | `lib/google-calendar.ts`, `appointments/page.tsx` | Not useful for this clinic; hide it, delete later. |
| G7 | `Patient.dateOfBirth` is **required**, and voice identity needs name + DOB. | schema, `lib/voice/identity.ts` | Zappy clients often have no birth date (it's a beauty-first tool), so the import would fail or need fake dates. |
| G8 | Any signed-in role, including VIEWER, can write appointments. | appointment routes | Fix in the booking service. |
| G9 | Two near-duplicate booking dialogs (`add-appointment-dialog.tsx`, `add-appointment-modal.tsx`). | `components/` | Replace with one booking panel. |

---

## 3. Target architecture

```
                  ┌──────────── writers ─────────────┐
 Staff agenda UI ─┤ /api/agenda/*  (staff session)    │
 Acácia (Vapi)  ──┤ lib/voice/tools.ts                │──►  lib/appointments/booking.ts
 Patient link   ──┤ /c/[token] page + /api/public/... │       • validate (availability engine v2)
 Zappy importer ──┤ scripts/import-zappy.ts           │       • per-day advisory lock + transaction
                  └───────────────────────────────────┘       • write Appointment
                                                              • write AppointmentEvent (history)
                                                              • plan/cancel AppointmentNotification rows
                                                              • audit log + staff alerts
                                                                        │
                                   ┌────────────────────────────────────┘
                                   ▼
                     appointment_notifications (outbox, Postgres)
                                   │  claimed with FOR UPDATE SKIP LOCKED
     cron-job.org (10 min) ──►  /api/cron/dispatch  ◄── after() kick for "send now" messages
     Vercel Cron (daily)   ──►        │
                                      ├─► Twilio SMS ──► /api/webhooks/twilio/status (delivery → bell colour)
                                      └─► lib/email/send.ts (Gmail/SendGrid/SMTP) + .ics attachment
```

Rules:
1. **Only `booking.ts` writes appointments.** Routes and tools become thin adapters. This keeps desk and AI behaviour identical.
2. **The outbox is the only way patient messages leave.** Rescheduling or cancelling cancels pending reminders in the same transaction, so a patient is never reminded of a slot that has moved.
3. **Times are stored in UTC and shown in clinic time** (`Settings.timezone`), as already done in `lib/clinic/time.ts`.

---

## 4. Calendar technology: what we use and why

- **Engine:** our own Postgres tables (D1). Nothing to sign up for, no tokens to expire, data stays in the EU (Neon Frankfurt, Vercel `fra1`).
- **UI library:** `@event-calendar/core` (MIT, latest 5.17.x). Pin an exact version at install that's at least two weeks old. It's framework-agnostic: we mount it in a React client component (`components/agenda/EventCalendar.tsx`) with `createCalendar(el, plugins, options)`, update options when props change, and destroy it on unmount. The plugins we use: TimeGrid, ResourceTimeGrid (columns per dentist/chair), DayGrid (month), List, Interaction (drag, resize, select).
  - Render in clinic time: the API returns wall-clock strings in `Settings.timezone` (`YYYY-MM-DDTHH:mm`) and the calendar treats them as local. This avoids a mismatch when someone's browser isn't set to Lisbon.
  - Styling: override the calendar's CSS variables with the app's tokens from `globals.css`, light and dark.
  - Labels and dates in pt-PT via `locale: 'pt-PT'`.
- **Rejected:** Google Calendar API (second source of truth, OAuth, patient data to Google, and no per-dentist columns in our UI anyway); FullCalendar (the column-per-resource views we need are paid); Cal.com self-hosted (a separate app to run, with its own database to sync); extending the hand-built grid (1,744 lines with no drag or columns; a rewrite costs more than the library).
- **"Google Calendar feel" for the team, for free (optional, Phase 6):** a private read-only **iCal feed per dentist** (`/api/calendar/feed/<token>.ics`) that they can subscribe to from Google or Apple Calendar on their phone. Events show initials and type only, it's off by default, and an admin can revoke the token.

---

## 5. Data model changes (one additive migration)

```prisma
model Provider {                      // replaces Settings.providers JSON (kept, read-only, for rollback)
  id                 String   @id @default(cuid())
  slug               String   @unique            // = old JSON id, e.g. "ana-nunes"
  name               String                       // "Dra. Ana Nunes" — also written to Appointment.provider
  title              String   @default("")
  registrationNumber String   @default("") @map("registration_number")   // nº OMD
  color              String   @default("#2563eb")
  active             Boolean  @default(true)
  agentBookable      Boolean  @default(true) @map("agent_bookable")     // Acácia may book this dentist
  appointmentTypes   String[] @map("appointment_types")                 // empty = all types
  sortOrder          Int      @default(0) @map("sort_order")
  userId             String?  @unique @map("user_id")                    // staff login → "my agenda"
  workingHours       ProviderWorkingHours[]
  appointments       Appointment[]
  blocks             CalendarBlock[]
  @@map("providers")
}

model ProviderWorkingHours {          // several rows per weekday = split shifts (09:30–12:30, 14:00–18:00)
  id         String   @id @default(cuid())
  providerId String   @map("provider_id")
  provider   Provider @relation(fields: [providerId], references: [id], onDelete: Cascade)
  weekday    Int                       // 0 = Sunday … 6 = Saturday (matches weekdayOf)
  start      String                    // "HH:MM" clinic time
  end        String
  @@index([providerId, weekday])
  @@map("provider_working_hours")
}

model Room {                          // chairs/gabinetes — optional; UI hides it while there's ≤ 1
  id        String  @id @default(cuid())
  name      String
  active    Boolean @default(true)
  sortOrder Int     @default(0) @map("sort_order")
  appointments Appointment[]
  blocks       CalendarBlock[]
  @@map("rooms")
}

model CalendarBlock {                 // personal time, vacation, training; null provider+room = whole clinic
  id          String    @id @default(cuid())
  providerId  String?   @map("provider_id")
  provider    Provider? @relation(fields: [providerId], references: [id], onDelete: Cascade)
  roomId      String?   @map("room_id")
  room        Room?     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  startTime   DateTime  @map("start_time")
  endTime     DateTime  @map("end_time")
  kind        String    @default("TIME_OFF")   // TIME_OFF | VACATION | MEETING | OTHER
  reason      String?
  seriesId    String?   @map("series_id")      // weekly repeats are stored as separate rows
  createdById String?   @map("created_by_id")
  createdAt   DateTime  @default(now()) @map("created_at")
  @@index([startTime, endTime])
  @@map("calendar_blocks")
}

model Appointment {                   // existing — new fields only
  // …existing fields unchanged (provider String? stays and is kept in sync with Provider.name)
  providerId      String?   @map("provider_id")
  providerRef     Provider? @relation(fields: [providerId], references: [id], onDelete: SetNull)
  roomId          String?   @map("room_id")
  room            Room?     @relation(fields: [roomId], references: [id], onDelete: SetNull)
  seriesId        String?   @map("series_id")
  checkedInAt     DateTime? @map("checked_in_at")        // "Chegou"
  allowedOverlap  Boolean   @default(false) @map("allowed_overlap")  // staff chose to double-book
  publicTokenHash String?   @unique @map("public_token_hash")        // SHA-256 of the /c/<token>
  externalId      String?   @unique @map("external_id")              // "zappy:<id>"
  events          AppointmentEvent[]
  notifications   AppointmentNotification[]
  @@index([providerId, startTime])
}

enum BookingSource { STAFF VOICE_AGENT CHATBOT WEBSITE WALK_IN PATIENT_LINK IMPORT }   // + 2 values

model AppointmentEvent {              // the history shown in the appointment drawer
  id            String   @id @default(cuid())
  appointmentId String   @map("appointment_id")
  appointment   Appointment @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  kind          String   // CREATED RESCHEDULED CANCELLED CONFIRMED CHECKED_IN COMPLETED NO_SHOW NOTE REMINDER_SENT REMINDER_DELIVERED REMINDER_FAILED
  actor         String   // STAFF | VOICE_AGENT | PATIENT | SYSTEM | IMPORT
  userId        String?  @map("user_id")
  vapiCallId    String?  @map("vapi_call_id")
  data          Json?    // {from, to, reason, lateNotice, channel…}
  createdAt     DateTime @default(now()) @map("created_at")
  @@index([appointmentId, createdAt])
  @@map("appointment_events")
}

model AppointmentNotification {       // the outbox
  id            String   @id @default(cuid())
  appointmentId String   @map("appointment_id")
  appointment   Appointment @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  patientId     String   @map("patient_id")
  kind          String   // CONFIRMATION | REMINDER_DAY_BEFORE | REMINDER_HOURS_BEFORE | RESCHEDULED | CANCELLED
  channel       String   // SMS | EMAIL
  sendAt        DateTime @map("send_at")
  status        String   @default("PENDING")  // PENDING SENDING SENT FAILED SKIPPED CANCELLED
  attempts      Int      @default(0)
  lockedAt      DateTime? @map("locked_at")
  sentAt        DateTime? @map("sent_at")
  providerMessageId String? @unique @map("provider_message_id")   // Twilio SID / email id
  deliveryStatus    String? @map("delivery_status")               // delivered | undelivered | failed
  error         String?
  dedupeKey     String   @unique @map("dedupe_key")   // `${appointmentId}:${kind}:${channel}:${startTime ISO}`
  createdAt     DateTime @default(now()) @map("created_at")
  @@index([status, sendAt])
  @@map("appointment_notifications")
}

model Patient {                       // existing — new / relaxed fields
  dateOfBirth         DateTime? @map("date_of_birth")   // was required (G7) — see §9.3
  nif                 String?
  clientSource        String?   @map("client_source")   // Zappy "origem"
  smsRemindersEnabled Boolean   @default(true) @map("sms_reminders_enabled")
}

model Settings {                      // existing — new fields
  agendaV2Enabled  Boolean @default(false) @map("agenda_v2_enabled")
  remindersEnabled Boolean @default(false) @map("reminders_enabled")
  reminderPolicy   Json?   @map("reminder_policy")      // validated in lib/clinic/settings.ts (§7.1)
}
```

The migration also:
- **backfills** `providers` from `Settings.providers` JSON and creates working hours from the clinic hours minus lunch;
- sets `Appointment.providerId` by matching names case-insensitively, leaving it null when nothing matches (the agenda shows those in an "Unassigned" column).

Making `dateOfBirth` nullable relaxes a constraint without dropping data. All 102 code references
then become `Date | null`, and `tsc` lists every one to fix, so none is missed.

---

## 6. Booking service (`lib/appointments/booking.ts`)

### 6.1 API
```ts
type Actor = { kind: 'STAFF'; userId: string; role: Role } | { kind: 'VOICE_AGENT'; callId: string | null }
           | { kind: 'PATIENT'; appointmentId: string } | { kind: 'IMPORT' }

createAppointment(input, actor)        // → { ok, appointment } | { ok:false, reason, conflicts? }
rescheduleAppointment(id, newStart, opts, actor)   // move in place (same id, same link), re-plan reminders
updateAppointment(id, patch, actor)    // type/duration/provider/room/notes — re-validates if time-relevant
setStatus(id, 'CONFIRMED'|'COMPLETED'|'NO_SHOW'|'CANCELLED', meta, actor)
checkIn(id, actor)                     // checkedInAt = now
createSeries(input, recurrence, actor) // N appointments, shared seriesId, returns per-date result
findNextFreeSlots({ type, providerId?, from, limit })   // "próximas vagas" for desk + Acácia
```

### 6.2 Availability engine v2 (extends the existing pure functions)
For each provider on a date, free = **clinic hours ∩ that dentist's hours − lunch − holidays −
blocks (provider, room, whole-clinic) − booked appointments plus buffer**. The appointment type
must be one the dentist does. If rooms are configured, a slot also needs a free room.
`checkSlot` and `computeDaySlots` stay pure; the new inputs (`providerHours`, `blocks`) are optional,
so the existing tests and callers keep working unchanged.

### 6.3 Rules by actor
| Rule | Voice agent | Patient link | Staff |
|---|---|---|---|
| Clinic hours, lunch, holidays, dentist hours, blocks | enforced | enforced | **warning**, booking allowed after confirming |
| Overlap with another appointment | refused | refused | refused; ADMIN/STAFF may confirm "double-book" (`allowedOverlap`, audited) |
| Min notice / max days ahead | enforced | enforced | not applied |
| Type must be `agentBookable`, dentist `agentBookable` | enforced | — | — |
| New patients | callback mode (unchanged) | — | allowed |
| VIEWER role | — | — | **read-only** (fixes G8) |

Every write runs inside the existing per-day advisory lock (`pg_advisory_xact_lock(hashtext('booking:'+date))`),
moved here from `lib/voice/tools.ts`. A reschedule across days takes both day locks in date
order to avoid deadlocks. One lock per clinic day is enough for a single clinic and is already
tested with simultaneous calls.

### 6.4 Recurring appointments
"Repeat every N weeks, X times" (or until a date) creates separate appointments sharing a
`seriesId`. Each one is a normal appointment: it gets its own reminders and can be moved
alone. Moving or cancelling one offers "this one / this and following". Dates that clash are
listed before saving, so the user can skip them or pick another time. There's no RRULE engine,
which keeps everything simple.

### 6.5 Side effects (same transaction, or right after commit)
`AppointmentEvent` row · audit log (existing format, plus the Vapi call id for AI) · plan or cancel
outbox rows (§7) · staff in-app notification and email alert (existing `notifyStaff` /
`emailStaffAlert`, moved out of the voice tools) · patient visit stats on COMPLETED.

---

## 7. Reminders and confirmations

### 7.1 Policy (Settings → Lembretes, zod-validated like the other settings)
```jsonc
{
  "confirmation":   { "enabled": true,  "channels": ["SMS", "EMAIL"] },     // right after booking
  "dayBefore":      { "enabled": true,  "sendAt": "10:00", "channels": ["SMS"] },
  "hoursBefore":    { "enabled": false, "hours": 3, "channels": ["SMS"] },   // off by default (cost)
  "changeNotices":  { "rescheduled": true, "cancelled": true },
  "quietHours":     { "start": "09:00", "end": "20:00" },                   // nothing sent outside
  "smsPlainCharacters": true,                                              // strip accents → 160 chars/SMS
  "templates": { "sms": { /* per kind, pt-PT */ }, "email": { /* per kind */ } }
}
```

### 7.2 Timing rules (what the planner writes when an appointment is created or moved)
- **Confirmation:** `sendAt = now`, then the dispatcher is kicked right away with `after()` so the patient gets it within seconds. It's skipped for imports and when staff untick "Notify patient".
- **Day before:** `sendAt = (appointment date − 1 day) at policy.sendAt`, Lisbon time. If that time has already passed or is within 2 h (a booking for tomorrow made this afternoon), it's skipped, because the confirmation covers it.
- **Hours before:** only if enabled and the appointment was booked more than `hours + 2` hours in advance.
- Any `sendAt` inside quiet hours moves to the next allowed minute; if that's after the appointment, the message is skipped.
- **Reschedule:** pending rows are cancelled and the plan is rebuilt for the new time. A "your appointment moved" notice goes out (the old slot was removed in the same transaction).
- **Cancel:** pending rows are cancelled and a cancellation notice is sent (unless the patient cancelled it themselves via the link; then they just see the confirmation page).
- **Who receives:** `Patient.phone` (E.164 via `lib/clinic/phone.ts`) and `Patient.email`. Skipped when `smsRemindersEnabled = false` or there's an SMS opt-out (existing `isPatientOptedOutByAnyRoute`). **No portal verification needed** (fixes G2). Appointment reminders are transactional messages for a service the patient asked for. Marketing consent is separate.

### 7.3 Message content (GDPR: no clinical details in SMS)
SMS example, using plain characters so one SMS holds 160 characters. Accented letters like
"ç/ã" switch to UCS-2 encoding, which only fits 70 characters and doubles the cost:
```
Clinica Nunes Monteiro: lembrete da sua consulta amanha, 14/11, as 10:30. Confirme ou desmarque: clinic.pt/c/Ab3dE9kQ2x
```
Merge tags: `{{primeiro_nome}} {{data}} {{hora}} {{medico}} {{clinica}} {{telefone_clinica}} {{morada}} {{link}}`.
The template editor shows a live preview, a character and SMS-segment counter, and a warning
when a template is longer than one SMS. Emails use pt-PT HTML and attach an `.ics` file with an
"Adicionar ao Google Calendar" link.

### 7.4 Patient page `/c/[token]` (public, added to `proxy.ts`'s public list)
- The token is a random 10-character base62 string. Only its SHA-256 hash is stored. It expires when the appointment ends, and the page is rate-limited.
- It shows the clinic name, date, time, dentist, address with a map link, and "add to calendar". It shows no treatment details.
- **Confirmo** sets CONFIRMED (`confirmedVia: 'link'`, event logged).
- **Não posso ir** cancels the appointment. Inside the cancellation notice window it still cancels, but marks a late cancellation and alerts staff (same as the voice tool today).
- **Quero remarcar** opens a callback request of type "reschedule" for the desk. In Phase 6 this becomes self-service slot picking.
- After the appointment, the page only shows "this appointment has passed" and the clinic phone.

### 7.5 Dispatcher `/api/cron/dispatch`
- Auth: `Authorization: Bearer ${CRON_SECRET}`. Vercel Cron sends it automatically; on cron-job.org it's set as a header.
- Claims up to 50 due rows atomically: `UPDATE … SET status='SENDING', locked_at=now() WHERE id IN (SELECT id … WHERE status='PENDING' AND send_at<=now() ORDER BY send_at FOR UPDATE SKIP LOCKED LIMIT 50) RETURNING *`. Rows stuck in SENDING for more than 10 min go back to PENDING. A failed send retries up to 3 times with a back-off of 5, 15 and 60 minutes.
- Before sending it checks again: is the appointment still active and is its start time the one in the `dedupeKey`? If not, the row is SKIPPED.
- After a send, it stores the Twilio SID and adds a `REMINDER_SENT` event. Twilio's **status callback** (`/api/webhooks/twilio/status`, signature-checked) sets `deliveryStatus`, which colours the bell on the agenda card: grey pending, green delivered, red failed. This matches Zappy's delivery reports.
- It writes `workerHeartbeatAt`, so the existing System Status check turns green.
- **Running twice or overlapping runs is safe**, which is why we can use two triggers.

### 7.6 Existing worker engine
It stays in the repo, untouched. Guard: when `remindersEnabled` is on, `services/emailScheduler.ts`
and `services/messageScheduler.ts` skip appointment-reminder triggers. That way, if someone starts
the worker later for campaigns, patients never get the same reminder twice.

---

## 8. Agenda UI/UX (`/appointments` becomes "Agenda")

**Layout**
- **Toolbar:** Hoje · ‹ › · date picker · view switch **Dia / Semana / Mês / Lista** · dentist chips (colour, click to show or hide) · "Colour by: type | dentist" · patient search (jumps to their next appointment) · primary button **+ Nova marcação**.
- **Day view:** one column per dentist (and per chair, if chairs are set up). **Week view:** one dentist, or everyone merged by colour. **List view** is the default on phones and has a print stylesheet for the day sheet.
- **Times you can't book are shaded:** outside a dentist's hours, lunch, and blocks (hatched, with the reason). A holiday shows a banner across the day.
- **Side panel on Day view:** *Hoje* (arrivals in order, with "Chegou" to tap), *Por confirmar amanhã* (each with call / SMS again), and *Próximas vagas* (next free slots for a chosen type and dentist; the phone answer to "when's the next opening?").

**Appointment card:** time · patient name · type · small icons: 🔔 reminder state, ✓ confirmed,
🤖 booked by Acácia, @ online, 🔁 series, ⚠ allergy or medical alert, 🎂 birthday this week, "Novo"
for a first visit. The left border is the type colour; no-shows are striped; cancellations are
hidden unless a filter shows them.

**Interactions**
- **Click an empty slot** opens a small booking popover: patient search-as-you-type (with "create new patient" inline: name, phone, optional DOB), type (fills in the duration), dentist from the column, notes, "Notify patient" (on by default), **Marcar**. Booking takes three clicks plus typing the name.
- **Booking from the patient record:** "Marcar consulta" opens the agenda in *booking mode*, with a sticky banner "A marcar para Maria Santos · Higiene oral (45 min)" and the free slots highlighted. One click on a slot books it.
- **Drag to move, drag the edge to resize.** A confirm bar appears: "Remarcar para qui 14/11 10:30? ☑ Avisar paciente por SMS", with Confirmar or Desfazer.
- **Drag across an empty area** offers "Marcar here" or **Bloquear horário** (reason, repeat weekly until).
- **Right-click / long-press menu:** Confirmar · Chegou · Concluída · Faltou · Remarcar · Desmarcar · Duplicar / próxima consulta · Declaração de presença · Abrir ficha.
- **Detail drawer** (opens from the side, keeps the agenda visible): patient summary with tap-to-call, status steps (Marcada → Confirmada → Chegou → Concluída), **message timeline** (confirmation sent 10:02 ✓ delivered, reminder ✓, confirmed by link 18:40), **change history** (created by Acácia on call #…, which you can play; moved by Sofia), notes, and a "missing DOB" or "missing phone" prompt.
- **Live updates:** the agenda checks every 20 s (`GET /api/agenda?from&to&since=`). New AI bookings appear with a toast: "Nova marcação pelo assistente: Maria S., qui 10:30".
- **Shortcuts:** `T` today, `D/S/M/L` views, `N` new booking, `←/→` move through dates, `Esc` close.
- **End-of-day nudge:** "3 marcações de hoje por fechar" (past appointments still SCHEDULED or CONFIRMED), with one-tap Concluída or Faltou.

**Settings additions:** *Médicos* (profile, colour, weekly hours with split shifts, types they do, AI-bookable, linked login) · *Gabinetes* (chairs, optional) · *Lembretes* (policy, templates with preview, test send to my phone) · *Bloqueios / férias* list.

**Endpoints for the UI** (fixes G5; the existing `/api/appointments` keeps its response shape for
current callers): `GET /api/agenda?from&to` returns `{ events, blocks, workingHours, providers, rooms }`
for the visible range with no row cap, plus `POST /api/agenda/appointments`,
`PATCH /api/agenda/appointments/[id]` (move, resize, edit), `POST …/[id]/status`,
`GET /api/agenda/free-slots`, and CRUD for blocks. All of them call `booking.ts`.

---

## 9. Voice agent (Acácia) alignment

1. **Tools call `booking.ts`.** The logic in `toolBookAppointment`, `toolRescheduleAppointment` and `toolCancelAppointment` moves into the service; the tools keep their pt-PT replies and audit tags. So the AI respects dentist hours, blocks and other dentists' bookings, and bookings made at the desk are instantly unavailable to the AI (one table, one lock).
2. **New optional `provider` argument** on `check_availability` and `book_appointment` (for "com a Dra. Ana"). The default is the patient's preferred dentist, otherwise any AI-bookable dentist who does that type. `check_availability` also returns the next free days (`findNextFreeSlots`). The Vapi tool JSON is regenerated from Settings → AI Voice Agent, as today (`docs/voice/vapi-setup.md`).
3. **Identity for imported patients without a DOB (G7).** If the record has no DOB and the **server-side caller ID matches exactly one patient's phone** and the spoken full name matches, the caller counts as verified ("phone + name"). Acácia then asks for the DOB and saves it to the record, marked "unconfirmed — confirm at next visit"; staff confirm it in one click from the drawer. Records with a DOB keep the current name + DOB check. Otherwise the caller gets a callback, as now.
4. **What Acácia tells patients changes:** after booking it says "vai receber um SMS de confirmação", and the confirmation goes through the same outbox.
5. Call log ↔ appointment links stay as they are. The drawer shows "booked on call #…" with the recording (via the existing proxied player).

---

## 10. Moving the data out of Zappy

### 10.1 Getting the data (ask the clinic owner, who is the Zappy admin)
| Data | How | Confirmed? |
|---|---|---|
| Clients | Zappy: client export to **CSV/Excel** | Yes (Zappy "Fichas de Cliente" page) |
| Appointments: all future + last 2–3 years | Operational report "Listagem de marcações", exported to Excel. If it's missing or limited, use the **Public API v5** (`api.zappysoftware.com/docs`, needs an API key from Zappy) | Report exists; export format to be confirmed |
| Staff, services, rooms | Short lists, copied by hand into Settings | — |
| Attachments, anamnesis forms, photos | Ask Zappy support for a bulk export | To be confirmed |

If Zappy doesn't give a full export, the clinic, as **data controller under GDPR Art. 20 (data
portability)**, is entitled to its data in a structured, machine-readable format. Ask in writing.

### 10.2 Script: `scripts/import-zappy.ts`
```
npx tsx scripts/import-zappy.ts --clients clients.csv --appointments appts.csv \
    --map scripts/zappy-map.json --dry-run          # writes import-report.csv, changes nothing
npx tsx scripts/import-zappy.ts … --commit           # upserts; safe to re-run
```
- **Mapping file** (`zappy-map.json`, reviewed with the clinic): Zappy service → our type (e.g. "Destartarização" → HYGIENE; unknown → OTHER, with the original name kept in `reason`); Zappy staff → provider slug; Zappy status → ours.
- **Clients → Patient:** name split (first word = first name, rest = surnames, as Portuguese naming already works in `identity.ts`); phone → E.164 (bad numbers reported); email; **NIF** (checksum validated); DOB if present; address and postal code; origin → `clientSource`; Zappy client number → `externalId = "zappy:<n>"`; notes → one `PatientNote` "Importado do Zappy"; GDPR marketing refusal → marketing unsubscribe (transactional reminders still allowed).
- **Duplicates:** matched first by `externalId`, then NIF, then phone + name. Matches are merged and conflicts listed in the report, never overwritten silently.
- **Appointments:** Lisbon wall time → UTC with `zonedTimeToUtc` (DST-safe); `bookedVia = IMPORT` (WEBSITE if Zappy marked it online); `externalId = "zappy:<booking id>"`. Statuses: Confirmada → CONFIRMED, Aguarda confirmação → SCHEDULED, Faltou → NO_SHOW, Cancelada → CANCELLED, Lista de espera → CANCELLED with the note "lista de espera Zappy" (re-entered as waitlist in Phase 6), a past appointment marked arrived or paid → COMPLETED, any other past one → COMPLETED with the flag "estado inferido".
- **The importer never creates notifications.** Reminders for imported future appointments are planned only when `remindersEnabled` is switched on at cutover, so patients don't get messages from both systems.
- Afterwards it recalculates `totalVisits` and `lastVisitAt`, and writes `AppointmentEvent(kind: CREATED, actor: IMPORT)`.
- **Report:** counts per status and per month; future appointments per day (to check against Zappy's agenda); rejected rows with reasons; duplicates; patients missing a phone or DOB.

### 10.3 Cutover (low-risk sequence)
1. **T−10 days:** deploy everything with the flags off. Dry-run the import on a Neon **branch** (a free copy of the database), and review the report with the clinic.
2. **T−7:** real import into production (flags still off). Staff train on the new agenda using their real data while Zappy stays the system they actually use.
3. **Cutover (Friday after closing):**
   1. In Zappy, turn off online booking, reminders and the AI phone assistant.
   2. Take a fresh export and run the importer again. Upserts by `externalId` pick up everything changed since T−7.
   3. Check: future appointments per day in the CRM = Zappy's agenda (the report gives the list); spot-check 10 patients.
   4. Turn on `agendaV2Enabled` and `remindersEnabled`. Point the clinic number's forwarding to Vapi if it pointed to Zappy's assistant.
   5. Test: book, move and cancel one test appointment by phone and at the desk, and check that the SMS arrives.
4. **Monday onwards:** two weeks of close support (watch System Status, the outbox for failed rows, and late cancellations).
5. **Keep Zappy read-only for 1–3 months** (don't cancel on day one) as a reference.

**Rollback:** turning the flags off brings back the old page and stops reminders. Zappy still has
everything up to the cutover, and `GET /api/agenda/export?from=` gives a CSV of bookings made in
the CRM since then, to re-enter if needed.

---

## 11. How we keep everything else working

- **Additive migration only** (new tables, nullable columns, two new enum values). The only relaxation is `dateOfBirth` becoming nullable. `Settings.providers` JSON and `Appointment.provider` text stay and are kept in sync, so emails, reports and the voice phrases that read them still work.
- **Flags:** with `agendaV2Enabled = false`, the current page renders exactly as now. With `remindersEnabled = false`, the planner still writes rows but the dispatcher only marks them SKIPPED. This lets us see what *would* have been sent before turning it on.
- **Existing routes keep their response shapes.** `/api/appointments` and `[id]` start calling `booking.ts` internally. The new conflict and hours checks return the same 409 or 400 style they use today.
- **Tests (added to the current 276 unit and 92 end-to-end):** availability v2 (dentist hours, split shifts, blocks, rooms, DST weeks in March and October); booking concurrency (desk and AI booking the same slot at the same moment); reschedule across days (lock order); reminder planning (each timing rule in §7.2, quiet hours, opt-out); dispatcher idempotency (two overlapping runs send once); public link (expired, wrong or reused token); importer against fixture CSVs (DST times, duplicates, bad phones, accents); and an end-to-end flow in `scripts/e2e/cycle.sh` covering a voice booking, its outbox rows, a dispatch, a delivery callback and the bell state.
- **The legacy Google Calendar overlay is hidden** in Agenda v2. It gets deleted in a later cleanup, not during this work.

---

## 12. Phases (rough working days for one developer)

| Phase | Delivers | Days | Done when |
|---|---|---|---|
| **0. Client inputs** | Zappy exports, list of dentists/hygienists with hours, services, number of chairs, invoicing answer (§13), Vercel plan, Twilio sender name | 1–2 (waiting on the clinic) | Files received; mapping agreed |
| **1. Foundation** | Migration + backfill · `booking.ts` · availability v2 · staff routes and voice tools on the service · VIEWER read-only · tests | 4–5 | All tests pass; desk and AI conflict test passes; behaviour unchanged with flags off |
| **2. Agenda UI** | Calendar component · day/week/month/list · dentist columns · booking popover · booking mode from patient record · drag, resize, block · drawer · free-slot panel · Settings: Médicos, Gabinetes, Bloqueios · attendance certificate | 6–8 | Receptionist books, moves and cancels without help in a test session; works on a phone |
| **3. Reminders** | Outbox + planner · dispatcher + cron-job.org/Vercel Cron · Twilio status webhook · `/c/[token]` page · .ics · Settings → Lembretes · bell states · System Status checks | 4–5 | Test patient gets confirmation, reminder and change notices; confirm and cancel links work; double run sends once |
| **4. Import** | `import-zappy.ts` + mapping + report · Neon-branch dry run · fixes from the report | 2–3 + clinic review | Report signed off by the clinic; future-per-day counts match Zappy |
| **5. Cutover** | §10.3 · two weeks of close support | 1 + 2 weeks | Zappy turned off for bookings; no unexplained failed messages |
| **6. Optional** | Waitlist (offer freed slots) · self-service reschedule via link · website booking widget (new patients need approval) · iCal feed per dentist · invoicing integration · WhatsApp reminders · SMS campaigns on the outbox | per item | — |

Phases 1 → 2 → 3 run in that order. Phase 4 can start as soon as Phase 1's schema is in, while
Phase 2 is being built.

---

## 13. Open questions for the clinic (and what we assume meanwhile)

| Question | Why it matters | Assumption until answered |
|---|---|---|
| **Do you invoice through Zappy (Zappy's own invoicing, or Vendus)?** | The CRM must not issue invoices; Portuguese invoicing software has to be AT-certified. If they invoice through Zappy, they need a certified invoicing tool before turning Zappy off (Vendus, InvoiceXpress, Moloni…). We can add a "Faturar" button that opens or creates the invoice there (Phase 6). | They keep or adopt a separate certified invoicing tool |
| Do you use packs, prepayment (MB WAY), stock or commissions in Zappy? | Not in this plan | Not used, or kept outside |
| How many dentists or hygienists, and how many chairs? | Columns and conflict rules | 1 dentist now, rooms off; built for more |
| Which reminders do you send today, and when? | Copy what patients already know | Day before at 10:00 by SMS + email confirmation |
| SMS sender name ("NunesMont") or a number patients can reply to? | Twilio setup; alphanumeric senders can't receive replies | Alphanumeric sender; replies go through the link |
| Vercel plan: Hobby or Pro? | Hobby → cron-job.org trigger; Pro → Vercel Cron only | Hobby |
| Staff screens in Portuguese? | The CRM's staff UI is in English today; there's no translation framework | The Agenda and Lembretes screens are built in pt-PT; the rest stays as is |

**Running costs:** the calendar, database tier, triggers and email (Gmail/SendGrid free tier) cost
nothing extra. The only new cost is **Twilio SMS** (per message segment; check the current Portugal
price on Twilio). Plain-character templates (§7.3) keep each reminder to one segment. One SMS per
appointment plus a confirmation means about two segments per visit; the email confirmation is free.

---

## Sources
- Zappy features: [zappysoftware.com](https://zappysoftware.com/), [Agenda](https://zappysoftware.com/features/calendar), [Lembretes](https://zappysoftware.com/features/reminders), [Fichas de cliente](https://zappysoftware.com/features/customer-records), [Marcações online](https://zappysoftware.com/features/online-booking), [Colaboradores](https://zappysoftware.com/features/staff-management), [Relatórios](https://zappysoftware.com/features/reports), [Integrações / API](https://zappysoftware.com/features/integrations), [IA](https://zappysoftware.com/features/artificial-intelligence), [Vendus × Zappy](https://www.vendus.pt/integracoes/zappy/), [My Zappy app](https://apps.apple.com/pt/app/zappy-you/id6474342459)
- Calendar libraries: [@event-calendar/core on npm](https://www.npmjs.com/package/@event-calendar/core) (MIT, resource views included), [FullCalendar Premium pricing](https://fullcalendar.io/premium), [react-big-calendar on npm](https://www.npmjs.com/package/react-big-calendar)
- Hosting limits: [Vercel Cron usage & pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) (Hobby: once per day), [Neon free plan limits](https://neon.com/faqs/free-plan-limits-and-quotas) (100 CU-hours/month, scale to zero after 5 min)
