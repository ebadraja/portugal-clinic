# Clínica Dentária Nunes Monteiro — Booking/CRM Implementation Plan

**App root:** `booking-app/`  
**Source of truth for inventory:** `REFACTOR-PLAN.md`  
**This document:** executable phased plan only — no application code is changed by producing it.

---

## Locked product decisions (do not re-open)

| Decision | Implementation consequence |
|----------|----------------------------|
| **U1 = Relabel, keep columns** | Relabel `parent*` UI to optional “emergency contact / responsible party.” Stop requiring on create. **Do not drop** DB columns. Reminder merge tags, SMS fallbacks, and patient matching keep reading `parent*` / `parentPhone`. |
| **U2 = Keep intake engine** | Keep `IntakeForm`, `PatientDraft`, review/publish, Hippatizer webhook receiver. Remove pediatric **mappings** and pediatric **sample data** only. Dental intake forms are **deferred**. |
| **Appointment types** | Add dental enum values via migration **before** removing `WELL_CHILD_VISIT` / `VACCINATION`. Never delete enum values while rows still reference them. |
| **Localization (US→PT)** | Required, but a **separate workstream** (see Workstream L). Do not mix into pediatric-removal phases. |

Supersedes `REFACTOR-PLAN.md` §5 Phase 5 “drop `parent*` columns” and “drop intake” branches — those paths are **out of scope**.

---

## Reminder delivery — global guardrails

The client’s core paid feature is appointment reminders. Today that stack is:

| Layer | Verified paths |
|-------|----------------|
| Email queue / SendGrid | `services/emailQueue.ts`, `services/emailScheduler.ts` |
| SMS automation (Twilio) | `services/messageScheduler.ts`, `lib/messaging/automationSms.ts`, `lib/messaging/smsProvider.ts` |
| Merge tags | `lib/email/mergeTags.ts`, `lib/messaging/mergeTags.ts` |
| Phone fallback / portal match | `lib/messaging/portalAuth.ts` (matches `parentPhone`), patient matcher / serializers |

**Rules for every phase**

1. Never drop or rename DB columns `parent_*` / `parent_phone*` in this plan.  
2. Before disabling or deleting `EmailTemplate` / `EmailAutomationRule` / `MessagingAutomationRule` rows or seed content that live DBs may use: **disable rules**, drain queues, snapshot DB (Phase 0).  
3. Any change to merge-tag **variable names** (`{{parent_*}}`, etc.) is a **reminder-breaking** change — prefer label/copy changes; keep token names stable unless a dedicated reminder migration is planned.  
4. WhatsApp is a **product goal** but **not implemented** in this codebase (only a UX mention in `REQUIREMENTS.md`). Replacing SMS/email defaults with WhatsApp is Workstream W — do not pretend Twilio SMS is WhatsApp.

---

## Phase map vs `REFACTOR-PLAN.md` §5

| This plan | REFACTOR §5 | Change class |
|-----------|-------------|--------------|
| Phase 0 | Phase 0 | Safety baseline |
| Phase 1 | Phase 1 | Product / presentation (no schema) |
| Phase 2 | Phase 2 | Product leaves (no schema) |
| Phase 3 | Phase 3 | Product-rule changes (no schema) |
| Phase 4 | Phase 4 | **Schema / data migration** |
| ~~Phase 5 column drop~~ | Phase 5 (partial) | **Cancelled** — columns kept |
| Workstream L | Phase 6 | Localization (separate) |
| Workstreams B / W / V / H | Gaps §6 | Build-forward (after or parallel, called out) |

---

# Phase 0 — Safety baseline

### Objective

Prove the app boots and core flows work; capture DB state for risk areas before any data-affecting work.

### Preconditions

- Dependencies installed in `booking-app/` (`npm install` already done in this workspace).  
- Valid `.env` for local Postgres / Redis as required by the app and worker (**UNVERIFIED** — confirm env keys against `.env.example` before running).  
- No other refactor branches mid-merge.

### Exact changes

**None to application code.** Operational checklist only:

1. Record git branch + HEAD commit.  
2. Run build/dev smoke (commands below).  
3. Take a **database snapshot / dump** before any later phase that touches templates, rules, or enums.  
4. Record counts/samples for risk areas (read-only SQL or Prisma Studio):

| Risk area | What to record | Why (`REFACTOR-PLAN.md` §8) |
|-----------|----------------|------------------------------|
| `appointments.type` | Counts per `AppointmentType` especially `WELL_CHILD_VISIT`, `VACCINATION` | Enum migration |
| `email_templates` / `EmailTemplate` | IDs/names containing Well-Child, Develo, NovoPsych, Kids branding | Reminder templates |
| `email_automation_rules` / `EmailAutomationRule` | Active rules + conditions JSON | Scheduler jobs |
| `messaging_automation_rules` / `MessagingAutomationRule` | Active rules + `appointmentTypes` conditions | SMS reminders |
| `patients` with non-null `parent_name` / `parent_phone` | Count + sample | Relabel must not break matching |
| `settings` row | `practice_name`, `business_hours`, `lunch_break` | Clinic hours / brand |

### What must NOT change

All KEEP modules (`REFACTOR-PLAN.md` §1): auth, dashboard, appointments engine, patient container, queues, messaging engines, Vapi webhook, Google Calendar.

### Verification steps

| # | Check | Pass |
|---|--------|------|
| 0.1 | `cd booking-app && npm run build` (or `npm run dev` if build too heavy) | Completes without error |
| 0.2 | Open `/login`, sign in with a known staff user | Dashboard loads |
| 0.3 | Open `/dashboard`, `/appointments`, `/patients` | Pages render |
| 0.4 | Create or open one appointment (read-only OK if create blocked by env) | No 500 |
| 0.5 | Create or open one patient (read-only OK) | No 500 |
| 0.6 | DB snapshot file stored and risk-area counts written into the PR/notes | Artifact exists |
| 0.7 | Confirm worker can start if reminders are tested later: `npm run worker` **UNVERIFIED locally** | Starts or documented skip |

### Rollback

N/A (no code/data changes). If snapshot fails, **stop** — do not start Phase 1+ data work.

### Risk notes

None for code. Skipping the snapshot makes Phase 4 and template cleanup irreversible without pain (`REFACTOR-PLAN.md` §8.2, §8.4).

---

# Phase 1 — Presentation / dead demo (lowest risk)

**Change class:** product / presentation only — **no schema migrations**.

### Objective

Remove pediatric chrome and demo surfaces so the shell reads as the dental clinic brand, without touching reminder data or enums.

### Preconditions

- Phase 0 complete (app boots; snapshot taken if any later DB edits are planned in the same release train).

### Exact changes

Traceable to `REFACTOR-PLAN.md` R4, R5 (presentation subset), §5 Phase 1:

| Action | Verified path | Notes |
|--------|---------------|-------|
| Rebrand sidebar title/subtitle | `components/sidebar.tsx` (“Kids 0-18” / “Integrated Pediatrics”) | |
| Rebrand login copy / branding | `app/login/page.tsx` | |
| Rebrand portal metadata/title | `app/portal/layout.tsx` | |
| Rebrand root metadata if pediatric | `app/layout.tsx` | Confirm strings before edit |
| Settings UI default practice name string | `app/(dashboard)/settings/page.tsx` (default includes `Kids 0-18 Integrated Pediatrics`) | Does not by itself update DB row |
| Schema **default** string for new Settings rows | `prisma/schema.prisma` `practiceName` `@default("Kids 0-18 Integrated Pediatrics")` | Changing default alone is not a data migration; existing rows unchanged |
| Merge-tag **fallback** practice strings | `lib/email/mergeTags.ts` (Kids / kids0218 fallbacks) | **Reminder-adjacent:** only change fallbacks/defaults, not `{{parent_*}}` token names |
| Replace “Vaccination Card” document label | `components/upload-documents-modal.tsx` | R4 |
| Scrub Well Child copy in webhook testing UI | `components/webhook-testing.tsx` | R4 |
| Optional: remove or archive docs | `GIGI_CHATBOT_IMPLEMENTATION_PLAN.md` | Docs only |
| Soft-disable or restrict sample draft seed route in production | `app/api/seed/sample-draft-patient/route.ts` | Prefer env/role guard — full content rewrite can wait for Phase 2 |
| Optional package display name | `package.json` `"name": "pediatric-practice-kid"` | Cosmetic |
| Optional PM2 names | `ecosystem.config.js` (kids018-*) | Deploy config; coordinate with host |

**Clinic hours (config, not new feature):**  
`lib/appointments/availability.ts` already reads `Settings.businessHours` + `Settings.lunchBreak` and skips lunch slots (default lunch in code if missing: `12:30`–`13:00`). Target clinic windows **09:30–12:30 / 14:00–18:00** are achieved by updating the **Settings** JSON (`businessHours` open/close + `lunchBreak` `{ start: "12:30", end: "14:00", enabled: true }`) via Settings UI or direct DB update — **not** by inventing a new hours engine.  
`lib/messaging/businessHours.ts` uses a **different** shape (per-day `open`/`close` without lunch split) for messaging online/offline — **UNVERIFIED** whether Settings UI edits both; flag if messaging “open” spans lunch incorrectly.

### What must NOT change

- `parent*` columns, create API required fields (Phase 3)  
- AppointmentType enum  
- BullMQ / schedulers / Twilio / SendGrid wiring  
- GIGI route **deletion** can wait until Phase 2 (Phase 1 may leave assets unused)  
- Google Calendar, Vapi webhook logic, intake engine  

### Verification steps

| # | Check | Pass |
|---|--------|------|
| 1.1 | `npm run build` or `npm run dev` | Boots |
| 1.2 | Login → dashboard | Works |
| 1.3 | Sidebar / login / portal show dental clinic name (not Kids 0-18) | Visual pass |
| 1.4 | Upload-documents modal: no “Vaccination Card” label | Visual pass |
| 1.5 | View/create appointment; view/create patient | Core flows OK |
| 1.6 | If Settings hours updated: `GET` availability for a weekday shows morning + afternoon gaps with lunch hole | Slots match 09:30–12:30 and 14:00–18:00 |

### Rollback

`git revert` the Phase 1 commit(s). Restore Settings `practiceName` / hours from Phase 0 snapshot if DB was edited.

### Risk notes

- Merge-tag fallback changes affect email body text when Settings/env unset — low risk if practice name is set in DB.  
- Do **not** delete live email templates in this phase (`REFACTOR-PLAN.md` §8.4).

---

# Phase 2 — Product leaves (staff can live without temporarily)

**Change class:** product feature removal — **no Prisma enum/column migrations**.  
**Reminder risk:** high if template/rule rows are deleted without draining — follow steps carefully.

### Objective

Remove GIGI pediatric chatbot product, pediatric automation **presets**, pediatric Hippatizer **mapping constants**, and Develo-oriented bulk-import entry points while keeping intake engine and reminder **infrastructure**.

### Preconditions

- Phase 1 merged.  
- Phase 0 snapshot available.  
- Inventory active campaigns/automations from Phase 0 notes.  
- If production worker is running: plan a maintenance window before template/rule deactivation.

### Exact changes

Traceable to R5, R6, R7, R8, R9 (partial), §5 Phase 2:

#### 2A — GIGI removal (R5)

| Action | Verified path |
|--------|---------------|
| Delete or stop serving widget assets | `public/gigi-chatbot.js`, `public/gigi-avatar.png`, `public/gigi-test.html` |
| Remove chatbot API routes | `app/api/chatbot/message/route.ts`, `book/route.ts`, `availability/route.ts` (and folder) |
| Remove chatbot lib | `lib/chatbot/cors.ts`, `rateLimit.ts`, `slots.ts`, `persistChatLog.ts` (entire `lib/chatbot/`) |
| Remove public exceptions | `proxy.ts` lines allowing `/api/chatbot`, `gigi-chatbot.js`, `gigi-avatar.png`, `gigi-test.html` — **keep** webchat public paths |
| Settings fields `chatbot*` | Leave columns in `Settings` for now (schema change deferred) or hide in Settings UI — **prefer UI hide** to avoid schema phase |

#### 2B — Pediatric email automation presets (R6) — UI first

| Action | Verified path |
|--------|---------------|
| Remove preset definitions (Develo EHR, NovoPsych/DEVELOPMENTAL, Well Child milestone) | `app/(dashboard)/email/automation/page.tsx` |
| Scrub scheduler comments only if desired | `services/emailScheduler.ts` (comments; no behavior required) |

**DB template/rule cleanup (reminder-critical):**

1. List active `EmailAutomationRule` / campaigns referencing pediatric templates.  
2. **Disable** rules (do not hard-delete while jobs may be queued).  
3. Confirm no pending BullMQ jobs for those `templateId`s (`services/emailQueue.ts`).  
4. Then mark templates inactive or delete — prefer inactive if schema supports it (**UNVERIFIED** whether soft-delete field exists; if not, delete only after disable + drain).  
5. Seed file for future resets: `seeds/emailTemplates.seed.ts` — remove/replace Well-Child, Develo, NovoPsych, Kids branding so re-seed does not resurrect them.

#### 2C — Hippatizer pediatric maps only (R7); engine kept (U2)

| Action | Verified path |
|--------|---------------|
| Remove pediatric entries from `formMappingsByTitle` | `lib/hippatizer/fieldMappings.ts` — at minimum titles: `"KiDS PATIENT INTAKE FORM"`, `"SENSORY ASSESSMENT - PARENT/CAREGIVER"`, `"SENSORY ASSESSMENT - ADOLESCENT"`, `"SENSORY ASSESSMENT - TEACHER"`, and related exported mapping arrays |
| Decide fate of `"DIAGNOSTIC INTERVIEW"`, `"PREVIEW INTERVIEW QUESTION"`, `"NEW PATIENT PRE-REGISTRATION"` | **OPEN** — may be pediatric-clinic-specific; if unsure, remove from `formMappingsByTitle` but keep file structure / `getMappingForForm` / `CRITICAL_MATCHING_FIELDS` pattern for future dental maps |
| Do **not** remove | `app/api/webhooks/hippatizer/route.ts`, draft pages, `PatientDraft` model, intake APIs |

#### 2D — Develo bulk import surface (R8)

| Action | Verified path |
|--------|---------------|
| Remove or hide CSV import UI entry | `components/csv-import-modal.tsx` usage from patients page (`app/(dashboard)/patients/page.tsx`) |
| API `app/api/patients/bulk-import/route.ts` | Prefer leave route returning 410/403 or keep unused until replaced — **do not** rewrite to a new PT importer in this phase |

#### 2E — Sample / seed pediatric content (R9 partial)

| Action | Verified path |
|--------|---------------|
| Neutralize sample draft “Well Child Visit - Emma Johnson” | `app/api/seed/sample-draft-patient/route.ts` |
| Update `prisma/seed.ts` for future seeds | Child patients / vaccine visits / Kids FAQs — replace or strip (dev only; production DB separate) |
| SMS seed copy “Kids 0-18…” | `lib/messaging/seedAutomationRules.ts` — **reminder-adjacent:** changing default **bodies** is OK; changing trigger wiring needs care |

### What must NOT change

- `services/emailQueue.ts` / `messageQueue.ts` architecture  
- `parent*` columns and merge-tag **names**  
- AppointmentType enum values  
- IntakeForm / PatientDraft / publish routes  
- Webchat (`public/webchat-*.js`, `app/api/webchat/`)  
- Vapi webhook (touched in Workstream V)  
- Google Calendar sync  

### Verification steps

| # | Check | Pass |
|---|--------|------|
| 2.1 | App builds/boots | OK |
| 2.2 | Login, dashboard, appointments, patients | Core OK |
| 2.3 | `/api/chatbot/*` returns 404; `gigi-chatbot.js` not public | GIGI gone |
| 2.4 | Webchat public paths still work if used | `/api/webchat/init` not broken by `proxy.ts` edit |
| 2.5 | Email automation page: no Develo/NovoPsych/Well Child presets | UI pass |
| 2.6 | Hippatizer webhook still responds (engine up); pediatric form titles simply get empty mapping | No 500 |
| 2.7 | **Reminder smoke:** with worker running, a non-pediatric active rule still queues/sends **or** documented “all rules disabled in this env” | No failed jobs storm |
| 2.8 | Create patient / appointment still works | OK |

### Rollback

Revert git commits for 2A–2E. Restore templates/rules from Phase 0 DB snapshot if rows were deleted. Re-deploy previous `public/gigi-*` if an external site still needed them (pediatric site only).

### Risk notes

- **§8.4 Live automations** — deleting templates while worker runs → failed jobs.  
- **§8.3 Intake** — removing maps is OK; removing webhook is not.  
- SMS seed body edits do not break delivery; disabling all messaging rules without replacement leaves **no** SMS reminders until dental templates exist (gap — see Open Questions).

---

# Phase 3 — Product-rule changes (unblock adult patients)

**Change class:** product rules only — **no schema / no column drops**.

### Objective

Allow adult patients: remove age 0–18 gates; make emergency/responsible-party (`parent*`) optional; relabel UI; soften merge-tag copy defaults without renaming tokens.

### Preconditions

- Phase 2 merged (GIGI child-booking path gone or unused).  
- Agreement that API create requires at least identity + contact per product (below).

### Exact changes

Traceable to R1, R2 (product side), U1 decision A, §5 Phase 3:

#### 3A — Remove age gating (R1)

| File | Change |
|------|--------|
| `components/add-patient-modal.tsx` | Remove “pediatric limit” / age > 18 validation |
| `components/edit-patient-modal.tsx` | Same |
| `components/patients/add-patient-dialog.tsx` | Remove Zod refine requiring DOB within last 18 years; keep “date in the past” if desired |

#### 3B — Stop requiring guardian on create (R2 product); keep columns (U1)

| File | Change |
|------|--------|
| `app/api/patients/route.ts` | Stop requiring `parentName` in the required-fields check; still accept and persist `parent*` when sent |
| `components/patients/add-patient-dialog.tsx` | `parentName` optional in Zod; relabel section to emergency contact / responsible party |
| `components/add-patient-modal.tsx` / `edit-patient-modal.tsx` | Relabel; optional |
| `app/(dashboard)/patients/[id]/page.tsx` | Relabel parent sections; keep field keys `parentName`, etc. |
| `app/(dashboard)/patients/page.tsx` | Column headers / draft display labels |
| Messaging UI copy that says “Parent” | e.g. `components/messaging/PatientContextPanel.tsx`, settings text in `MessagingSettingsTab.tsx` (“parents who have verified”) — relabel to patient/responsible party as appropriate |

**Do not change:** Prisma `Patient` field names; `lib/messaging/portalAuth.ts` matching against `parentPhone`; `lib/email/mergeTags.ts` keys `parent_first_name`, etc. (optional: change **fallback strings** from “your child” / “Parent” to neutral adult copy — safe; renaming tokens is **not** in this phase).

#### 3C — Tests

| Paths (from REFACTOR R9) | Update expectations for optional parent / adult age / brand strings |
|--------------------------|---------------------------------------------------------------------|
| `tests/messaging/*`, `tests/email/*` | Fix assertions on Kids 0-18 / required parent / child fallbacks |

### What must NOT change

- DB columns / migrations  
- AppointmentType enum  
- Reminder queues  
- Token names in merge engines  
- Intake publish mapping of caregiver → `parent*` in `app/api/patient-drafts/[id]/publish/route.ts` (still valid storage)  

### Verification steps

| # | Check | Pass |
|---|--------|------|
| 3.1 | App boots | OK |
| 3.2 | Create patient age 40 with phone/email, **without** emergency contact | `POST /api/patients` 200/201 |
| 3.3 | Create patient **with** emergency contact filled into former parent fields | Persists; detail page shows relabeled fields |
| 3.4 | Login, dashboard, create appointment for that patient | OK |
| 3.5 | Portal auth still finds patient by phone when number is on `phone` or `parentPhone` | **UNVERIFIED** full OTP flow — at least unit/integration if present |
| 3.6 | Send or dry-run merge tags for a patient with empty `parentName` | Email/SMS body renders; no crash (`your child` fallback gone or neutral) |
| 3.7 | `npm test` (or targeted vitest) | Green or known skips documented |

### Rollback

Revert Phase 3 commits. No DB migrate to undo. Re-enable required `parentName` if emergency rollback needed for old pediatric ops (not expected for this clinic).

### Risk notes

- **§8.1 `parent*` load-bearing** — optional create is safe; dropping columns is forbidden.  
- Patients with reminders that historically emailed/SMS’d **guardian** phone may need staff to copy patient mobile into `phone` or keep using `parentPhone` as responsible-party phone — **operational** note, not schema.  
- Vapi still sends `parent_name` in places (`app/api/webhooks/vapi/route.ts`) — left for Workstream V; may create odd labels until updated.

---

# Phase 4 — Appointment type taxonomy (schema / data migration)

**Change class:** **schema + data migration** — isolate from Phases 1–3.  
Requires Phase 0 snapshot. Never mix with optional product-rule edits in the same commit if avoidable.

### Objective

Introduce dental `AppointmentType` values, migrate rows off `WELL_CHILD_VISIT` / `VACCINATION`, then remove those pediatric enum values safely.

### Preconditions

- Phases 1–3 merged.  
- **Final dental enum list confirmed** (see Open Questions — do not migrate on guesses).  
- Phase 0 counts of rows by type.  
- GIGI book whitelist already removed (Phase 2) so it cannot insert old types.  
- Vapi `mapVisitType` still maps to pediatric types until Workstream V — either update Vapi in the **same release** as enum removal or keep pediatric values until Vapi is updated (**coordination required**).

### Exact changes

Traceable to R3, §5 Phase 4; verified UI/API touchpoints:

#### 4A — Add new enum values (migration 1)

1. Update `prisma/schema.prisma` `enum AppointmentType` to **add** dental values (keep old values temporarily).  
2. `prisma migrate` add-values-only.  
3. Regenerate client.

**Proposed candidates** (from `REFACTOR-PLAN.md` §6 — **not confirmed by clinic**):  
Exam, Hygiene, Restorative, Endo, Surgery, Emergency, Consult, Other — exact Prisma identifiers **OPEN**.

Also decide fate of existing non-pediatric-exclusive values: `SICK_VISIT`, `CONSULTATION`, `PROCEDURE`, `FOLLOW_UP`, `OTHER` (REFACTOR U5).

#### 4B — Data migration (migration 2 / SQL)

1. Map every `WELL_CHILD_VISIT` / `VACCINATION` row → agreed dental type or `OTHER`.  
2. Update `MessagingAutomationRule` / `EmailAutomationRule` condition JSON that references old visit types (`email/automation` presets already removed in Phase 2; **live DB rules** may remain).  
3. Verify zero rows remain on pediatric values:

```sql
-- illustrative; run against actual enum/table names from Prisma @@map
SELECT type, COUNT(*) FROM appointments GROUP BY type;
```

#### 4C — Remove pediatric enum values (migration 3)

Only after 4B verification. Update schema to drop `WELL_CHILD_VISIT`, `VACCINATION`. Migrate carefully (Postgres enum drops are awkward — follow Prisma/Postgres practices).

#### 4D — Application list updates (can ship with 4A once values exist)

| Verified path | Update type lists / defaults / labels |
|---------------|----------------------------------------|
| `components/add-appointment-dialog.tsx` | Options currently include Well-child / Vaccination |
| `components/add-appointment-modal.tsx` | Default `WELL_CHILD_VISIT` |
| `app/(dashboard)/appointments/page.tsx` | Type style map + default `WELL_CHILD_VISIT` |
| `app/api/reports/overview/route.ts` | Label map includes Well Visit / Vaccination |
| `app/(dashboard)/email/campaigns/page.tsx` | Type labels if present |
| `app/(dashboard)/email/automation/page.tsx` | Any remaining visitType options |
| `app/api/chatbot/book/route.ts` | Already removed in Phase 2 — N/A |
| `app/api/webhooks/vapi/route.ts` | `mapVisitType` → dental types (coordinate with Workstream V) |
| `prisma/seed.ts` | Seed appointments use new types |

`Settings.appointmentTypes` JSON (**schema field exists**) — **UNVERIFIED** whether UI still drives from enum alone or also this JSON; check Settings page before assuming.

### What must NOT change

- Appointment CRUD engine, availability algorithm structure  
- Google Calendar integration contracts (event times)  
- `parent*` columns  
- Reminder queue code paths (only condition JSON / labels)  

### Verification steps

| # | Check | Pass |
|---|--------|------|
| 4.1 | Migrations apply on a **copy** of prod dump first | Success |
| 4.2 | `SELECT` shows no `WELL_CHILD_VISIT` / `VACCINATION` | Zero |
| 4.3 | App boots; Prisma client matches DB | OK |
| 4.4 | Create appointment with each new dental type | Success |
| 4.5 | Calendar/list filters and reports render | No missing-label crashes |
| 4.6 | Automation rules with updated conditions still evaluate | Reminder tick dry-run OK |
| 4.7 | Login, dashboard, patient create, appointment create | Core OK |

### Rollback

Restore DB from Phase 0 snapshot; deploy previous schema commit. Enum removal rollbacks are hard — **prefer expandable migrations and delay 4C** until dental types proven in production for one release.

### Risk notes

- **§8.2 Enum migration** — deleting values with live rows fails.  
- Reminder rules keyed on visit type silently stop matching if JSON not updated → **missed reminders**.  
- Vapi booking can write invalid/old types if not updated in lockstep.

---

# Workstream H — Clinic hours defaults (config)

**Not a pediatric-removal phase.** Can run anytime after Phase 0; ideally with Phase 1 brand settings.

### Objective

Persist Nunes Monteiro hours: **09:30–12:30** and **14:00–18:00** (lunch **12:30–14:00**).

### Exact changes

| Item | Verified |
|------|----------|
| Update `Settings.businessHours` + `lunchBreak` | schema fields; consumed by `lib/appointments/availability.ts` and Vapi hours check in `app/api/webhooks/vapi/route.ts` |
| Settings UI | `app/(dashboard)/settings/page.tsx` — confirm controls exist for hours/lunch (**UNVERIFIED** field-level UI; seed shows shape in `prisma/seed.ts`) |
| Messaging hours | `messagingBusinessHours` + `lib/messaging/businessHours.ts` — single window; may show “online” during lunch unless configured closed or split — **OPEN** |

### Reminder impact

None directly. Availability gaps affect what gets booked; booked appointments still remind.

### Verification

Availability API / appointments UI shows no bookable slots 12:30–14:00; morning and afternoon slots exist on weekdays.

---

# Workstream L — US → Portugal localization (separate)

**Do not mix into Phases 1–4.** Track as its own delivery.

### Objective

European Portuguese UI + PT phone/address/insurance/timezone suitable for Malveira clinic.

### Known code hotspots (`REFACTOR-PLAN.md` U7)

| Area | Verified paths |
|------|----------------|
| US phone/ZIP/state Zod | `components/patients/add-patient-dialog.tsx` (`US_PHONE`, `US_ZIP`, `US_STATE`); similar patterns in add/edit modals **UNVERIFIED all files** — grep `US_PHONE` / `\(\d{3}\)` before starting |
| Insurance catalog | `lib/insurance-plans.ts` |
| Merge-tag / practice locale | `lib/email/mergeTags.ts` date formatting (`date-fns`) — locale **UNVERIFIED** |
| Staff default password string | `Kid0-18CRM` in `app/api/staff/[id]/route.ts` — change in brand pass |

### Reminder impact

Phone normalization (`formatPhoneE164` in `lib/messaging/smsProvider.ts`) must accept PT numbers or **SMS/WhatsApp reminders fail**. Treat as reminder-critical when this workstream ships.

### Verification

Create patient with PT mobile; run reminder dry-run; UI strings pt-PT for staff shell (scope of i18n framework **OPEN** — no next-intl found in this pass; **UNVERIFIED**).

---

# Workstream W — WhatsApp reminders (new build)

### Objective

Replace email/SMS as the **default** patient reminder channel with WhatsApp.

### Codebase fact

No WhatsApp provider implementation found (grep only `REQUIREMENTS.md` chat UX metaphor). Current automation channel enums/schemas use **SMS** (`lib/messaging/schemas.ts`, `seedAutomationRules.ts`, `automationSms.ts` → Twilio).

### Plan constraints

- Reuse scheduler/queue patterns in `services/messageScheduler.ts` / `messageQueue.ts` where possible.  
- Do **not** claim existing SMS path is WhatsApp.  
- Provider choice (Twilio WhatsApp, Meta Cloud API, etc.) — **OPEN**.  
- Keep email/SMS code paths until WhatsApp proven; feature-flag default channel in Settings.

### Reminder impact

**Highest** for the paid feature. Ship behind flag; dual-run with SMS until delivery rates confirmed.

### Verification

Template send to a test WhatsApp number; automation tick creates WhatsApp job; failure does not disable email/SMS fallback until accepted.

---

# Workstream B — Online booking widget (gap fill)

### Objective

Public adult booking UI after GIGI removal (`REFACTOR-PLAN.md` §6 gap).

### Facts

- GIGI booking API (`/api/chatbot/book`) removed in Phase 2 used `childName` / `childDob` / `parentName`.  
- Shared slot algorithm remains: `lib/appointments/availability.ts` (also used by staff API).  
- Marketing site lives in sibling `dental-website/` (out of scope for booking-app code here).  
- Webchat (`/api/webchat/*`) is messaging, not a full booking calendar — **UNVERIFIED** whether it can book appointments.

### Plan

1. Design adult book payload (patient name, DOB optional, phone, type, slot).  
2. New public API (or carefully generalized former chatbot book) + CORS for `clinicadentariaih.com` (domain from dental site config — verify before hardcoding).  
3. Embed on `dental-website` or standalone widget.  
4. Wire `BookingSource` (schema has `CHATBOT` / `WEBSITE` etc.) appropriately.

### Reminder impact

New bookings must still enter `Appointment` so schedulers see them — use existing create path semantics.

---

# Workstream V — Vapi voice agent alignment

### Objective

Voice agent books/logs calls for dental adults; stop writing pediatric visit types and child/parent intake copy.

### Verified touchpoints

| Path | Pediatric coupling |
|------|--------------------|
| `app/api/webhooks/vapi/route.ts` | `mapVisitType` → `WELL_CHILD_VISIT` / `VACCINATION`; uses `businessHours` + `lunchBreak`; references `parent_name` / child naming in intake message strings |
| `app/api/webhooks/vapi/test/route.ts` | Test helpers |
| Call logs UI | `app/(dashboard)/call-logs/` — KEEP shell |

### Sequencing

- Before Phase 4C (enum drop): update `mapVisitType` to dental types.  
- After Phase 3: accept adult patient match by patient phone; treat `parent_name` as optional responsible party.  
- External Vapi assistant prompts/tools — **outside this repo** — must be updated in the Vapi dashboard (**UNVERIFIED** contents).

### Reminder impact

Indirect: wrong/missing appointments from voice → missed reminders. Logging-only changes are low risk.

---

# Explicitly out of scope (this plan)

| Item | Reason |
|------|--------|
| Dropping `parent*` / `parent2*` columns | Locked decision |
| Building dental Hippatizer/intake form definitions | Deferred (U2) |
| Growth charts / immunization modules | Do not exist (`REFACTOR-PLAN.md` R4) |
| Implementing full pt-PT i18n inside Phases 1–4 | Workstream L |
| Implementing WhatsApp inside Phases 1–4 | Workstream W |
| Modifying `dental-website/` in pediatric-removal phases | Separate app |
| `privateMode` product decision (U3) | Still open — leave behavior as-is unless decided |

---

# Suggested delivery order (executable sequence)

```
Phase 0  →  Phase 1  →  Phase 2  →  Phase 3  →  Phase 4
                ↓
         Workstream H (hours/brand settings) anytime after Phase 0
                ↓
After Phase 2–3: Workstream B (booking widget), Workstream V (Vapi)
Parallel track: Workstream L (PT localization)
After stable SMS reminders on adult data: Workstream W (WhatsApp default)
```

---

# Open questions

1. **Final Prisma `AppointmentType` identifiers** for dental (and whether to keep `SICK_VISIT` / `PROCEDURE` / `FOLLOW_UP` / `CONSULTATION`)? Required before Phase 4.  
2. **Mapping** of historical `WELL_CHILD_VISIT` / `VACCINATION` rows → which dental type or `OTHER`?  
3. Which Hippatizer titles besides sensory/KiDS intake are pediatric-only (`DIAGNOSTIC INTERVIEW`, `PREVIEW INTERVIEW`, `NEW PATIENT PRE-REGISTRATION`)?  
4. **WhatsApp provider** and whether email/SMS remain fallback channels permanently?  
5. **i18n approach** for European Portuguese staff UI (no framework verified in-repo this pass)?  
6. Does Settings UI edit both `businessHours`/`lunchBreak` and `messagingBusinessHours`? Lunch split for messaging online status?  
7. Does `Settings.appointmentTypes` JSON override UI enums anywhere? (**UNVERIFIED**)  
8. Production: are pediatric email/SMS automations currently active on the DB this app will use? (Affects Phase 2 drain steps.)  
9. `privateMode` — keep as generic privacy flag or hide? (U3 undecided.)  
10. Public booking: host on `dental-website` vs CRM-served widget only?  
11. Vapi assistant tool schemas / prompts — who updates the external Vapi project relative to Phase 4?  
12. Minimum required fields on adult patient create after Phase 3: is `dateOfBirth` still required for portal DOB verification flows?

---

# Discrepancies noted (REFACTOR vs code)

| REFACTOR statement | Code finding |
|--------------------|--------------|
| `proxy.ts` “Likely allows” GIGI paths | **Confirmed:** `proxy.ts` allows `/api/chatbot` and `gigi-*` / `gigi-test.html` static files |
| Reports “if typed” for WELL_CHILD | **Confirmed:** `app/api/reports/overview/route.ts` maps `WELL_CHILD_VISIT` / `VACCINATION` |
| Phase 5 may drop `parent*` columns | **Superseded** by locked decision — columns stay |
| Availability / lunch | **Confirmed:** `lib/appointments/availability.ts` already implements lunch skip; clinic hours are mostly Settings data |
| WhatsApp as reminder channel | **Not in codebase** — product goal → Workstream W |

---

*End of IMPLEMENTATION-PLAN.md*
