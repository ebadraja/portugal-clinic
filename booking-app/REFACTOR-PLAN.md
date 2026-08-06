# Pediatric → Adult Dental Booking/CRM — Refactor Plan

**Scope:** `booking-app/` (Next.js; formerly `pediatric-app/`).  
**Mode:** Analysis only — this document does not change application code.  
**Goal:** Remove pediatric-specific features while keeping auth, dashboard shell, appointments/calendar, patient-record container, and the reminder/queue engine intact.

---

## How to read this document

| Bucket | Meaning |
|--------|---------|
| **KEEP** | Core clinic infrastructure — leave working; rebrand later as needed |
| **REMOVE** | Clearly pediatric — cut in a later implementation pass |
| **UNSURE / SHARED** | Mixes generic + pediatric, or purpose is ambiguous — do not cut without a decision |

For every **REMOVE** item: dependencies, routes/APIs, DB surface, and blast radius are listed.  
A **safe removal order** and **dental gaps** follow at the end.

---

## 1. KEEP — Core clinic infrastructure

These should stay. Some contain pediatric *copy* or enum values that will need a follow-up rebrand/rename pass; the *modules themselves* are keepers.

### 1.1 Authentication & access

| Module | Paths | Why keep |
|--------|-------|----------|
| NextAuth + credentials | `auth.ts`, `auth.config.ts`, `app/api/auth/[...nextauth]/route.ts` | Staff login |
| Login UI | `app/login/page.tsx` | Entry point (rebrand strings later) |
| Session provider | `components/session-provider.tsx` | Session plumbing |
| Staff CRUD / roles | `app/(dashboard)/staff/`, `app/api/staff/`, `components/invite-staff-modal.tsx` | Access control |
| Account avatar | `app/api/account/avatar/route.ts` | Staff profile |
| Access-control settings | `app/api/settings/access-control/route.ts` | Permissions |
| Proxy / middleware | `proxy.ts` | Route protection + public widget paths |

### 1.2 Dashboard shell & navigation

| Module | Paths | Why keep |
|--------|-------|----------|
| Root / dashboard layouts | `app/layout.tsx`, `app/(dashboard)/layout.tsx` | App chrome |
| Sidebar + header | `components/sidebar.tsx`, `components/header.tsx` | Nav shell (rebrand “Kids 0-18”) |
| Dashboard home | `app/(dashboard)/dashboard/page.tsx`, `app/api/dashboard/route.ts` | Overview |
| Notifications UI + API | `app/(dashboard)/notifications/`, `app/api/notifications/` | In-app alerts |
| Reports shell | `app/(dashboard)/reports/`, `app/api/reports/overview/route.ts` | Analytics container |
| Theme / toast | `components/theme-provider.tsx`, `components/toast*.tsx` | UX chrome |
| Shared UI (shadcn) | `components/ui/*` | Design system |

### 1.3 Appointments & calendar (engine)

| Module | Paths | Why keep |
|--------|-------|----------|
| Appointments page | `app/(dashboard)/appointments/page.tsx` | Calendar/list UI |
| Appointments API | `app/api/appointments/` (`/`, `[id]`, `availability`, `new-count`) | CRUD + slots |
| Availability algorithm | `lib/appointments/availability.ts` | Shared slot logic |
| Appointment modals/dialogs | `components/add-appointment-modal.tsx`, `components/add-appointment-dialog.tsx` | Booking UI shell |
| Google Calendar OAuth/events | `app/api/auth/google-calendar/`, `app/api/google-calendar/events/`, `lib/google-calendar.ts`, settings hooks | External calendar sync |
| `Appointment` model + status/source enums | `prisma/schema.prisma` | Core scheduling data |

> **Note:** The *appointment engine* is KEEP. Specific enum values (`WELL_CHILD_VISIT`, `VACCINATION`) and pediatric labels in the UI are REMOVE / rebrand — see §2 and §3.

### 1.4 Patient-record container (generic structure)

| Module | Paths | Why keep |
|--------|-------|----------|
| Patients list / detail pages | `app/(dashboard)/patients/page.tsx`, `patients/[id]/page.tsx` | Record shell |
| Patients API | `app/api/patients/` (`/`, `[id]`, `bulk`, `email-status`, unsubscribe) | CRUD container |
| Notes / documents modals | `components/add-notes-modal.tsx`, `components/upload-documents-modal.tsx`, delete confirmation | Chart attachments |
| Models: `Patient` (identity + contact + medical notes), `PatientNote`, `Document`, `Appointment` history | `prisma/schema.prisma` | Record backbone |

Generic fields to preserve conceptually: `firstName`, `lastName`, `dateOfBirth`, `gender`, `phone`, `email`, address fields, insurance basics, `allergies` / `medications` / `medicalNotes`, `status`, visit counters, relations to appointments/notes/documents.

### 1.5 Reminder / queue engine

| Module | Paths | Why keep |
|--------|-------|----------|
| BullMQ email queue | `services/emailQueue.ts` | SendGrid delivery |
| Email scheduler | `services/emailScheduler.ts` | Timed appointment reminders / campaigns |
| Message (SMS) queue | `services/messageQueue.ts` | SMS job runner |
| Message scheduler | `services/messageScheduler.ts` | Automation-rule tick |
| Worker entry | `worker.ts`, `ecosystem.config.js` | Background process |
| Automation coordination | `lib/messaging/automationCoordination.ts`, `automationSms.ts` | Dedup / suppress |
| Email merge engine (mechanism) | `lib/email/mergeTags.ts` | Template variable resolution |
| Models: `EmailTemplate`, `EmailCampaign`, `EmailLog`, `EmailAutomationRule`, `MessagingAutomationRule`, `MessageTemplate`, `Unsubscribe` | schema | Reminder data |

> Pediatric **template content** and **default rules** are REMOVE; the queue/scheduler architecture is KEEP.

### 1.6 Settings (infra) & shared integrations

| Module | Paths | Why keep |
|--------|-------|----------|
| Settings page + APIs | `app/(dashboard)/settings/page.tsx`, `app/api/settings/*` (email, messaging, google-calendar, hippatizer config storage, access-control) | Practice config store |
| `Settings` model | schema | JSON/config bag |
| Gmail OAuth | `app/api/auth/gmail/`, `lib/google/gmailToken.ts` | Email send path |
| Twilio webhook | `app/api/webhooks/twilio/route.ts` | SMS inbound |
| Crypto / prisma / logger / utils | `lib/crypto.ts`, `lib/prisma.ts`, `lib/logger.ts`, `lib/utils.ts` | Shared infra |

### 1.7 Messaging & portal (channel infrastructure — keep engines)

| Module | Paths | Why keep |
|--------|-------|----------|
| Messaging inbox UI + components | `app/(dashboard)/messaging/`, `components/messaging/*` | Staff inbox |
| Messaging APIs | `app/api/messaging/**` | Conversations, templates, files, rules |
| Portal pages + APIs | `app/portal/**`, `app/api/portal/**`, `components/portal/*` | Patient-facing channel |
| Webchat widget + API | `public/webchat-*.js`, `app/api/webchat/` | Embeddable chat (rebrand) |
| Models: `Conversation`, `Message`, `SharedInbox*`, `PatientPortalSession`, `Broadcast`, `SMSOptOut` | schema | Channel data |

Copy that says “parents” / “Kids 0-18” is a rebrand task; the channel stack is KEEP unless a later product decision drops messaging entirely.

### 1.8 Call / chat logs (ops shell)

| Module | Paths | Why keep |
|--------|-------|----------|
| Call logs / chat logs pages + APIs | `app/(dashboard)/call-logs/`, `chat-logs/`, matching `app/api/*` | Voice/chat ops |
| Vapi webhook | `app/api/webhooks/vapi/` | Voice agent ingestion |
| Models: `CallLog`, `ChatLog` | schema | Log storage |

---

## 2. REMOVE — Pediatric-specific

Items below are clearly tied to ages 0–18, guardians-of-minors, well-child/vaccination clinical framing, Kids 0–18 branding, or pediatric assessment/import workflows.

### R1. Age 0–18 gating / validation

| Location | Behavior |
|----------|----------|
| `components/add-patient-modal.tsx` | Rejects DOB if computed age > 18 (“pediatric limit”) |
| `components/edit-patient-modal.tsx` | Same |
| `components/patients/add-patient-dialog.tsx` | Zod: DOB must be within last 18 years |

**Dependencies / blast radius**

| Touches | Detail |
|---------|--------|
| Imports | Used by patients list/detail and appointment flows that open “add patient” |
| Routes | Client-only validation today; create still goes to `POST /api/patients` |
| API | `app/api/patients/route.ts` does **not** re-check age server-side — UI is the gate |
| DB | None (no age column) |
| Breaks if removed carelessly | Nothing structural — **removing the check is required** for adult patients. Leaving it blocks adults. |

**Removal note:** This is “remove the restriction,” not “delete the forms.” Forms stay (KEEP/UNSURE); only the age rule goes.

---

### R2. Guardian / parent-of-minor as required patient model (product-facing)

| Location | Behavior |
|----------|----------|
| `Patient.parentName` **required** on create | `app/api/patients/route.ts` |
| UI requires parent/guardian | `add-patient-dialog.tsx`, add/edit modals, patient detail |
| Second guardian fields | `parent2*`, `parentPhone2` throughout patients UI/API |
| Search by `parentName` | `GET /api/patients` |
| Chatbot booking creates parent on child | `app/api/chatbot/book/route.ts` (`childName`, `childDob`, `parentName`, `parentPhone`) |
| Portal / messaging types expose `parentName` | `types/messaging.ts`, serializers |

**Dependencies / blast radius**

| Touches | Detail |
|---------|--------|
| Imports | Patient pages, messaging patient context, email merge tags, bulk-import, drafts publish |
| Routes | `/patients`, `/patients/[id]`, `/api/patients`, `/api/patients/[id]`, `/api/patients/bulk-import`, `/api/chatbot/book`, messaging conversation serializers |
| DB columns | `patients.parent_name`, `parent_relation`, `parent_phone`, `parent_email`, `parent2_*`, `parent_phone2` |
| Breaks if columns dropped without migration | Email merge tags (`{{parent_*}}`), SMS/automation patient matching that falls back to `parentPhone`, GIGI book, draft publish mapping, CSV/Develo import, tests |

> **Important:** Columns are also **UNSURE** as a data-layer decision (§3.1). Product REMOVE = stop treating them as required guardian-of-minor UX. Physical column drop is a later, careful migration.

---

### R3. Pediatric appointment types & clinical visit framing

| Item | Where |
|------|-------|
| Enum values `WELL_CHILD_VISIT`, `VACCINATION` | `prisma/schema.prisma` `AppointmentType` |
| Labels in booking UI | `add-appointment-dialog.tsx`, `add-appointment-modal.tsx`, appointments page |
| Chatbot allowed types | `app/api/chatbot/book/route.ts` |
| Email automation presets | `email/automation/page.tsx` — “Well Child Milestone”, visitType `WELL_CHILD_VISIT` |
| Campaign UI labels | `email/campaigns/page.tsx` |
| Reports grouping | `app/api/reports/overview/route.ts` (if typed) |
| Seed appointments | `prisma/seed.ts` |

Also UI-only (not in Prisma enum): `DEVELOPMENTAL` / developmental-behavioral used in email automation + tests.

**Blast radius**

| Touches | Detail |
|---------|--------|
| DB | Existing rows may already store `WELL_CHILD_VISIT` / `VACCINATION` — cannot remove enum values until data migrated |
| APIs | Appointments create/update validate against enum; chatbot book whitelist |
| Schedulers | Automation rules may condition on `appointmentTypes` including these values |
| Breaks | Any rule/template/seed still referencing removed enum values; Prisma client regenerate after enum change |

---

### R4. Vaccination / well-child clinical surfaces (no dedicated growth/immunization modules)

**Finding:** There are **no** growth-chart pages, immunization schedule tables, or well-child checklist models in the schema.

Pediatric clinical framing that *does* exist and should be removed/replaced:

| Item | Path |
|------|------|
| Document type “Vaccination Card” | `components/upload-documents-modal.tsx` |
| Webhook test copy “Well Child Visit…” | `components/webhook-testing.tsx` |
| Seed FAQs / call logs about vaccines, parents, CHIP | `prisma/seed.ts` |
| Email template “Well-Child Check Due” | `seeds/emailTemplates.seed.ts` |
| Sample draft “Well Child Visit - Emma Johnson” | `app/api/seed/sample-draft-patient/route.ts` |

**Blast radius:** Mostly UI labels + seed/demo data. Document category string may already exist on stored `Document` rows — check before renaming.

---

### R5. Kids 0–18 / GIGI branding & pediatric chatbot product

| Item | Paths |
|------|-------|
| Sidebar / portal / login branding | `sidebar.tsx`, `app/portal/layout.tsx`, `app/login/page.tsx`, `app/layout.tsx` metadata |
| GIGI widget + avatar + test HTML | `public/gigi-chatbot.js`, `gigi-avatar.png`, `gigi-test.html` |
| GIGI APIs | `app/api/chatbot/{message,book,availability}/` |
| Chatbot lib | `lib/chatbot/*` (CORS locked to kids0218 + Webflow pediatrics) |
| Default practice name in Settings / merge tags | schema default `"Kids 0-18 Integrated Pediatrics"`; `lib/email/mergeTags.ts` fallbacks |
| SMS seed copy | `lib/messaging/seedAutomationRules.ts` |
| Docs | `GIGI_CHATBOT_IMPLEMENTATION_PLAN.md` |
| Staff default password string | `Kid0-18CRM` in `app/api/staff/[id]/route.ts` |
| Package name | `package.json` → `pediatric-practice-kid` |
| PM2 / ecosystem names | `ecosystem.config.js` (kids018-*) |

**Blast radius**

| Touches | Detail |
|---------|--------|
| `proxy.ts` | Likely allows public `/gigi-*` / chatbot paths — clean when widget removed |
| CORS | `lib/chatbot/cors.ts` — only relevant to GIGI |
| DB | Chat logs created by GIGI; Settings JSON may store widget config |
| Breaks if removed mid-flight | Embedded script on old Webflow site; any bookmark to `gigi-test.html`. Core CRM unaffected if chatbot routes 404 |

---

### R6. Pediatric email templates & automation presets

| Item | Path |
|------|------|
| Develo EHR Registration Link template | `seeds/emailTemplates.seed.ts` |
| NovoPsych Screening Reminder | same |
| Well-Child Check Due | same |
| Branding shell “KiDS 0 to 18…” | same + merge tag practice defaults |
| Automation UI presets: Develo −7d, NovoPsych/DEVELOPMENTAL, Well Child milestone | `app/(dashboard)/email/automation/page.tsx` |
| Scheduler comments referencing Develo −168h | `services/emailScheduler.ts` |

**Blast radius**

| Touches | Detail |
|---------|--------|
| DB | Live `EmailTemplate` / `EmailAutomationRule` rows may already be seeded in deployed DBs |
| Queue | Jobs reference `templateId` — deleting templates breaks queued/scheduled sends |
| Breaks | Active campaigns/automations pointing at deleted templates |

---

### R7. Hippatizer pediatric form field maps (sensory / developmental / school)

| Item | Path |
|------|------|
| Caregiver + childName + adolescent + preschool + sensory scores + teacher/grade maps | `lib/hippatizer/fieldMappings.ts` |
| Form title keys e.g. `SENSORY ASSESSMENT - PARENT/CAREGIVER` | same |
| Webhook → draft pipeline using those maps | `app/api/webhooks/hippatizer/route.ts` |

**Blast radius**

| Touches | Detail |
|---------|--------|
| Intake → `PatientDraft` | Caregiver fields populated from maps |
| Settings Hippatizer | Form IDs / mappings in DB (`IntakeFormFieldMapping`) |
| Breaks | Incoming Hippatizer webhooks for pediatric form titles stop mapping; unmatched forms may still store raw intake |

> The **webhook + IntakeForm + PatientDraft engine** is SHARED (§3.2). Only the pediatric mapping tables/content are REMOVE.

---

### R8. Develo pediatric CSV bulk import (caregiver columns)

| Item | Path |
|------|------|
| Develo row mapper (Caregiver1/2, DoB MM/DD/YYYY) | `app/api/patients/bulk-import/route.ts` |
| CSV import modal wired to that API | `components/csv-import-modal.tsx` |
| `Patient.externalId` comment / raceEthnicity / membershipStatus “Develo import” | schema |

**Blast radius**

| Touches | Detail |
|---------|--------|
| API | `POST /api/patients/bulk-import` |
| UI | Patients page import entry |
| DB | Writes `parent*` / `externalId` etc. |
| Breaks | Staff workflow that imports Develo exports — dental clinic needs a different import or manual entry |

---

### R9. Pediatric seed / sample data & tests fixtures

| Item | Path |
|------|------|
| Child patients, vaccine visits, parent FAQs | `prisma/seed.ts` |
| Email template seed (see R6) | `seeds/emailTemplates.seed.ts` |
| Sample draft patient route | `app/api/seed/sample-draft-patient/route.ts` |
| Tests asserting Kids 0-18 / parent merge tags | `tests/messaging/*`, `tests/email/*` |

**Blast radius:** Dev/demo only if not used in production. Production DB content is separate — do not assume seed = live data.

---

## 3. UNSURE / SHARED — Do not guess; decide explicitly

These mix KEEP infrastructure with REMOVE pediatric semantics, or purpose is ambiguous for an adult dental clinic.

### U1. `Patient.parent*` / `parent2*` columns (data layer)

| Why shared | Reminder merge tags, SMS fallbacks (`parentPhone`), messaging serializers, and portal flows all read these fields. Adult dental may still want an “emergency contact” or “responsible party,” which could **reuse** columns with renamed labels — or need a new model. |
| Decision needed | (A) Relabel to emergency/contact party and stop requiring on create; (B) migrate to `emergencyContact` only and drop `parent*`; (C) introduce `PatientContact` table. |
| Risk if guessed | Breaking reminder delivery and patient matching. |

### U2. Hippatizer + Intake Forms + PatientDraft pipeline

| Generic KEEP pieces | `IntakeForm`, `IntakeFormFieldValue`, `PatientDraft`, `IntakeFormFieldMapping`, webhook receiver, draft review UI (`patient-drafts/[id]`), publish → Patient |
| Pediatric pieces | Caregiver1/2 draft fields, sensory/developmental maps, sample well-child draft, badge count of drafts on Patients nav |
| Decision needed | Keep intake-as-CRM-feature for dental forms? If yes, replace maps + draft field set. If no, whole pipeline is removable later — large blast radius. |

### U3. `privateMode` on Patient

| Where | schema, patients API create/update, patient detail checkbox |
| Ambiguity | No docs in-repo clarifying pediatric-only meaning vs general privacy flag for messaging/lists. |
| Decision needed | Keep as privacy flag, or remove if it was for adolescent confidentiality workflows. |

### U4. `PatientStatus.DRAFT` + draft publish flow

| Tied to | Intake/Hippatizer unpublished patients |
| Ambiguity | Useful for any clinic’s “pending chart” workflow, but currently caregiver-shaped. |
| Decision needed | Keep status + simplify fields, or remove draft concept with intake. |

### U5. AppointmentType values `SICK_VISIT`, `CONSULTATION`, `PROCEDURE`, `FOLLOW_UP`, `OTHER`

| Ambiguity | Not pediatric-exclusive, but current label set is pediatrics-oriented. Dental needs cleaning/exam/endo/etc. |
| Decision needed | Rename/extend enum for dental visit types vs keep generic OTHER + free-text `reason`. |

### U6. Messaging / portal “parent verified phone” product rules

| Engine KEEP | OTP portal, conversations, file sharing, automation SMS |
| Pediatric copy / assumptions | Settings text: “parents who have verified”; merge tags default “your child”; portal title “Kids 0-18” |
| Decision needed | Rebrand only vs change verification identity model (adult = patient phone, not guardian). |

### U7. US phone/ZIP/state validation & `lib/insurance-plans.ts`

| Ambiguity | Built for US pediatric practice; Portugal dental clinic may need PT NIF/phone and different insurers. |
| Decision needed | Localization pass (out of pure “pediatric remove” but blocks Portugal use). |

### U8. Vapi voice agent webhook field expectations

| Path | `app/api/webhooks/vapi/route.ts` (+ test) |
| Ambiguity | May create/match patients with parent/child semantics (same CRM). Needs line-by-line product decision before cut. |

### U9. Webchat widget (`Kids018Webchat`) vs GIGI

| GIGI | Clear REMOVE (R5) |
| Webchat | Staff messaging channel — KEEP engine, rebrand name/strings. Confirm no child-only identity checks in `webchat-core.js` / `app/api/webchat/*` before treating as fully generic. |

### U10. Document categories & medical fields

| `allergies`, `medications`, insurance fields | Useful for dental; KEEP likely |
| Vaccination document type | REMOVE label (R4) |
| Ambiguity | Whether dental wants medical-history depth or a thinner chart |

### U11. `raceEthnicity` / `membershipStatus` / `externalId`

| Marked | “Develo import — not wired” |
| Decision | Drop with Develo (R8) or keep `externalId` for future PMS sync |

---

## 4. REMOVE items — dependency matrix (blast radius summary)

| ID | Item | Primary importers / UI | APIs / routes | DB | Breaks if cut without prep |
|----|------|------------------------|---------------|-----|----------------------------|
| R1 | Age ≤18 validation | add/edit patient modals, add-patient-dialog | Indirect `POST/PATCH /api/patients` | — | Blocks adults if left in; safe to delete checks |
| R2 | Guardian-required UX | Patient forms, detail, messaging panel | patients CRUD, chatbot book, bulk-import, draft publish | `parent*` columns | Create API 400s; merge tags empty; matcher regressions |
| R3 | WELL_CHILD / VACCINATION types | Appointment dialogs, automation UI, seeds | appointments, chatbot book, reports | `Appointment.type` enum + rows | Prisma migrate fails if rows remain; rules mismatch |
| R4 | Vaccination / well-child labels & samples | upload modal, webhook testing, seeds | seed sample-draft | Document type strings; seed rows | Cosmetic / demo |
| R5 | GIGI + Kids branding | sidebar, login, portal, public widgets | `/api/chatbot/*`, proxy public paths | Settings defaults, ChatLogs | External embed 404; CRM OK |
| R6 | Pediatric email templates/presets | email campaigns/automation UI | email template/campaign APIs, schedulers | EmailTemplate, EmailAutomationRule | Orphaned automations / failed jobs |
| R7 | Pediatric Hippatizer maps | (via webhook) | hippatizer webhook, mappings | IntakeFormFieldMapping JSON, draft caregiver fields | Unmapped pediatric forms |
| R8 | Develo bulk import | csv-import-modal | `/api/patients/bulk-import` | Patient parent*/externalId | Import button fails / wrong mapping |
| R9 | Pediatric seeds/tests | — | `/api/seed/sample-draft-patient` | seed DB | CI test failures until fixtures updated |

---

## 5. Safe removal order

Remove **leaves first** (UI copy, widgets, seeds), **shared data last** (enums, columns). After each phase, app should still boot and core flows work.

### Phase 0 — Baseline (no cuts)

1. Confirm `npm run dev` + login + open dashboard/appointments/patients.  
2. Snapshot DB (especially `Appointment.type`, email templates/rules, patients with `parent*`).

### Phase 1 — Pure presentation / dead demo (lowest risk)

1. Rebrand visible strings: sidebar, login, portal layout, package display name (optional).  
2. Delete or stop linking GIGI assets + test HTML; remove chatbot CORS allowlist entries for kids0218 (or entire chatbot routes in Phase 2).  
3. Replace “Vaccination Card” label; scrub webhook-testing Well Child copy.  
4. Update/remove pediatric markdown plans if desired (`GIGI_*.md`) — docs only.  
5. Soft-disable seed sample-draft route in non-dev if exposed.

**Exit criteria:** App runs; no pediatric chrome in shell; GIGI optional 404 OK.

### Phase 2 — Product leaves (features staff can live without temporarily)

1. Remove `/api/chatbot/*` + `lib/chatbot/*` + proxy exceptions for GIGI.  
2. Remove email automation **presets** (Develo/NovoPsych/Well Child) from automation page UI.  
3. Archive/delete pediatric **EmailTemplate** rows (or mark inactive) after confirming no active campaigns.  
4. Remove Develo-specific bulk-import UI entry **or** gate behind feature flag (keep API until import replaced).  
5. Strip pediatric Hippatizer **mapping constants** for sensory/adolescent/preschool; leave generic identity mappings if intake kept (see U2).

**Exit criteria:** No GIGI; no pediatric automation presets; intake webhook still accepts generic forms if U2 = keep.

### Phase 3 — Validation & required-field rules (unblocks adult patients)

1. Remove age 0–18 checks (R1) in all three patient forms.  
2. Stop requiring `parentName` in UI + `POST /api/patients` (R2 product rule).  
3. Adjust messaging/email copy defaults (“your child” → patient name) in merge tags — **without** dropping DB columns yet.  
4. Update tests that assert Kids/parent/age behavior.

**Exit criteria:** Can create an 40-year-old patient with phone/email only (per product rules).

### Phase 4 — Appointment type taxonomy

1. Add dental types (or map old → new) **before** deleting enum values.  
2. Data migration: `WELL_CHILD_VISIT` / `VACCINATION` → agreed dental/OTHER.  
3. Update UI lists, chatbot (if any remains), automation conditions, seeds.  
4. Remove obsolete enum values from Prisma + regenerate client.

**Exit criteria:** No pediatric enum values in schema or rows.

### Phase 5 — Data-layer caregiver / draft shape (highest risk — only after U1/U2 decisions)

1. If U1 = drop columns: migrate `parent*` → emergency/contact fields; update merge tags, serializers, matchers, draft publish.  
2. If U2 = drop intake: remove draft pages/APIs, Hippatizer webhook, related nav badges — **after** confirming no production dependency.  
3. Clean `PatientDraft` caregiver columns / publish mapping.  
4. Replace seeds for dental demo data.

**Exit criteria:** Schema and APIs match adult dental contact model; CI green.

### Phase 6 — Localization follow-ups (not pediatric, but Portugal-critical)

US phone/ZIP, insurance plan list, practice timezone/locale — track separately from pediatric removal (U7).

---

## 6. Gaps the dental version must fill

| Gap after pediatric removal | Why it appears | Suggested fill |
|----------------------------|----------------|----------------|
| **Adult patient create/edit form** | Current forms require guardian + age ≤18 | Same forms with adult validation; emergency contact optional |
| **Dental appointment types** | Removing WELL_CHILD/VACCINATION leaves thin taxonomy | e.g. Exam, Hygiene, Restorative, Endo, Surgery, Emergency, Consult, Other |
| **Adult intake / medical history** | Hippatizer maps + sample draft are pediatric; if maps removed, intake is empty of meaning | New dental anamnesis form + field mappings (or manual CRM entry only) |
| **Import path** | Develo caregiver CSV is pediatric-EHR-specific | PT clinic CSV/PMS import or “no bulk import v1” |
| **Reminder template content** | Seeds/templates address parents & well-child | Dental appointment reminder / confirmation / post-op templates in PT/EN |
| **Public booking widget** | GIGI books *child + parent*; removing it leaves no public book UI | Dental web booking on `dental-website` or a rebranded webchat/book API with adult fields |
| **Brand & CORS** | kids0218 / Webflow pediatrics origins | clinicadentariaih.com (or final domain) + new practice name in Settings |
| **Voice agent prompts** (if Vapi kept) | Likely pediatric dialog flows | Dental FAQs, services, emergency toothache routing |
| **Insurance catalog** | `lib/insurance-plans.ts` is US-centric | Portuguese insurers / self-pay / ADSE etc., or free-text only |
| **Legal/SMS copy** | “Parents verified via portal” | Adult patient consent language (GDPR/Portugal) |

**Explicit non-gaps (already absent):** dedicated growth charts, immunization schedule engine, well-child checklist modules — nothing to delete there; nothing to replace unless dental wants charting later.

---

## 7. Module inventory cheat-sheet

| Area | Bucket |
|------|--------|
| Auth / staff / roles | KEEP |
| Dashboard shell / nav / settings page chrome | KEEP (rebrand) |
| Appointments engine + Google Calendar | KEEP |
| AppointmentType WELL_CHILD / VACCINATION | REMOVE (migrate) |
| Patient pages + CRUD container | KEEP |
| Age ≤18 validation | REMOVE |
| Guardian required UX | REMOVE (columns = U1) |
| Notes / documents / insurance fields | KEEP / U10 |
| BullMQ + schedulers + SendGrid/Twilio plumbing | KEEP |
| Pediatric email templates & automation presets | REMOVE |
| Messaging + portal + webchat engines | KEEP / U6 / U9 |
| GIGI chatbot product | REMOVE |
| Hippatizer webhook engine | UNSURE (U2) |
| Sensory/developmental field maps | REMOVE |
| PatientDraft caregiver model | UNSURE (U2) |
| Develo bulk import | REMOVE |
| privateMode | UNSURE (U3) |
| Call/chat logs + Vapi ingest | KEEP / U8 |
| Seeds & Kids fixtures | REMOVE |
| US validation / insurance-plans | UNSURE (U7) |

---

## 8. Biggest risks (read before any cut)

1. **`parent*` is load-bearing** — Not just labels: create API, merge tags, SMS fallbacks, draft publish, import, and chatbot all depend on it. Treating column drop as a Phase 1 cleanup will break reminders.  
2. **AppointmentType enum migration** — Postgres/Prisma enum changes need a data migration; deleting values with live rows fails.  
3. **Intake/Hippatizer is a coupled subsystem** — Removing “pediatric forms” without deciding whether dental keeps intake can orphan drafts, webhook settings, and nav badges.  
4. **Live email/SMS automations** — Deleting templates or rules while the worker runs causes failed jobs; drain/disable first.  
5. **False confidence from “no growth charts”** — Pediatric behavior is woven into validation, enums, templates, and imports — not a single feature folder.

---

## 9. Out of scope for this plan

- No code changes in this pass (except creation of this file).  
- No schema migrations authored here.  
- `dental-website/` (Astro marketing site) is untouched.  
- Final dental UX copy (PT/EN/ES) and clinical charting beyond booking/CRM are future work.

---

*Generated from a read-only walk of `booking-app/` for the Portugal Clinic dental repurposing effort.*
