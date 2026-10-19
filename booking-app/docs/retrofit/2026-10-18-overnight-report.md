# Booking CRM retrofit — overnight report (17–18 Oct 2026)

Scope: bring `booking-app` up to the CRM playbook standard (`REAL ESTATE AGENT/docs/playbook`)
for the clinic's actual job — Acácia answers the phone, answers questions, books or routes, and
staff follow up — under Portuguese/EU rules (GDPR). Website chatbot deliberately left for later.

Nothing was committed. Nothing touched any real database during the build. Follow-up on 18 Oct
(approved by the owner): `auth.ts` and `proxy.ts` were changed for two-factor sign-in, session
timeout and the public email links — see "Follow-up" below.

## Evidence

| Check | Before | After |
|---|---|---|
| Type-check (`tsc --noEmit`) | 0 errors | 0 errors |
| Unit tests (`npm test`) | 81 / 82 (1 stale pediatric fixture failing) | **276 / 276** |
| Lint (`eslint .`) | 154 problems (97 errors) | 150 (96 errors) — 0 in new files |
| Production build | passes | passes (20 new routes) |
| Placeholder / fake-data scan (`npm run check:stubs`) | — | 0 findings in 284 files |
| End-to-end (`bash scripts/e2e/cycle.sh`) | — | **92 / 92** on a fresh database |

The end-to-end run starts a throwaway Postgres (PGlite), applies **all 12 migrations from
scratch** (and `prisma migrate diff` confirmed zero drift from `schema.prisma`), seeds, runs the
production build, and drives it over HTTP as a browser and as Vapi.

## What changed

### Fixed — things that were unsafe or wrong for this clinic
1. **Voice webhook fails closed.** It accepted unsigned requests whenever `VAPI_WEBHOOK_SECRET`
   was unset; now it refuses (503). Constant-time comparison. Full payloads (transcripts) are no
   longer printed to the logs. Every delivery is recorded in `voice_webhook_events` (metadata only).
2. **No personal data to unverified callers.** `lookup_patient` used to read out DOB and insurance
   to anyone who said a first name. Every patient-specific tool now needs full name + DOB matching
   exactly one record, and never returns the DOB, insurance or clinical data.
3. **Bookings in Lisbon time.** Times were built in the server's zone (UTC on Vercel), so summer
   bookings would land an hour off. All dates and times now use `Settings.timezone`
   (Europe/Lisbon), including both 2026 daylight-saving switchovers.
4. **Real opening hours.** The voice agent was offering the pediatric seed hours (Mon–Fri
   08:00–17:00, **Saturdays open**). It now uses the clinic's hours (Mon–Fri 09:30–12:30 and
   14:00–18:00), Portuguese national holidays (including the Easter-based ones), and custom closures.
5. **No double bookings.** The old booking tool didn't check for conflicts. It now checks hours,
   lunch, buffers, minimum notice and existing appointments, and locks the day so two calls can't
   take the same slot (tested with simultaneous calls).
6. **Recordings never reach the browser.** The provider link used to be in the page. Audio now
   streams through `/api/call-logs/[id]/recording` behind the staff session, with an allowlist
   (no SSRF), 206 Range support for Safari/iOS, and one audit row per playback.
7. **Handler-level auth on every staff route.** Ten routes relied only on `proxy.ts`. All now check
   the session themselves. `VIEWER` is read-only on the patient, callback and settings routes
   (appointment routes still let any signed-in role write, as before).
8. **No shared password.** Invites and admin resets used the default password `Kid0-18CRM`. Staff
   now get a one-time link (72 h for invites, 2 h for resets; stored as a hash; usable once), by
   email or shown once to the admin. "Forgot password" works, and the login page's dead SSO and
   "Need help" controls are gone.
9. **Portuguese phone numbers.** `912 345 678` was rejected by the add-patient form, by SMS
   formatting and by portal sign-in (all US-only). These now accept PT and international numbers,
   and caller ID `+351…` matches a number saved as `912 345 678`.
10. **Opt-outs outlive the record.** An SMS STOP was deleted along with the patient. It now stays
    (keyed by number), is recorded even for unknown numbers, and is checked against the actual
    destination number. PARAR and SAIR are understood.
11. **Patient-facing reminders.** Emails carried a fake phone `(555) 123-4567`, a fake address,
    "Dr. Tamas", US date formats, server time and the pediatric 48-hour cancellation rule. They now
    use the clinic's own settings, Lisbon time and pt-PT formatting.
12. **The seed can't wipe production.** It deletes every table, so it now refuses unless the
    database is local (or explicitly opted in), and never runs with `NODE_ENV=production`. The
    admin password comes from `SEED_ADMIN_PASSWORD`.

### Built — settings that actually work
The old page saved nothing except the Hippatizer tab ("Saved!" was shown regardless). Now:

| Tab | Real behaviour |
|---|---|
| **System Status** (new) | Live checks: webhook secret, encryption key, worker heartbeat, call reports arriving, refused deliveries, demo data left in Settings, missing NIF/ERS, open/urgent callbacks |
| Practice Information | Details, opening hours + lunch, holidays & closures, booking rules, providers, legal identity (NIF, ERS, OMD, Livro de Reclamações), time zone & language — validated and audited with before/after |
| AI Voice Agent | Kill switch (pause tools), agent name, transfer number, insurers, setup values to paste into Vapi (generated from code), delivery status with causes, prompt clause checker |
| Appointment Types | Dental types with duration, buffer, "from" price, colour, active, and whether Acácia may book them |
| Knowledge Base | Approved answers for `answer_question`; one-click import of the website FAQ so the site and Acácia say the same thing |
| Integrations | Real connection state (was hard-coded "connected") |
| Notifications | Alert address + switches that send real emails for voice-agent bookings, cancellations, escalations and new-patient requests |
| Security & Audit | Live checks + audit log viewer with filters and CSV export (the export itself is audited) |
| Usage (was "Billing") | Real calls, minutes, outcomes, voice bookings and callbacks per month (was "$299 / 687 calls" placeholder) |
| Account | Profile saves; password change; dark mode |

Website Chatbot was not changed, as agreed. Its page-level Save now honestly says "not saved yet"
instead of pretending.

### Built — workflow features
- **Callbacks** page and sidebar badge: new patients awaiting a capacity check, urgent cases
  and anything Acácia couldn't do. Urgent first; assign; "calling now"; an outcome note is required
  to close. Taps to call.
- **Voice tools** (10, in pt-PT): availability, book, **reschedule** (new), cancel (flags late
  cancellations), callback, transfer (open vs closed), insurance, opening hours, FAQ — with the
  new-patient callback rule and the kill switch.
- **Call outcomes from facts:** the end-of-call report is filed from what the tools did during the
  call, then from structured output, with keyword matching only as a fallback. Duplicates are
  idempotent; the booked appointment, patient and callbacks are linked to the call.
- **GDPR rights:** an admin can export everything held on a patient (JSON) or permanently erase
  them. Erasure requires typing the name and a reason, keeps the opt-out and an audit tombstone,
  and deletes call/chat transcripts, intake forms, email logs and messages. Message attachments
  are deleted from storage on a best-effort basis; uploaded patient documents are removed from the
  database, but their files are only reported back for manual removal.
- **Patient record reads are audited** (detail, recordings).
- **Worker heartbeat**, so "reminders aren't being sent" shows up on System Status instead of
  failing silently.

## Deploy checklist — in this order

1. **Migration:** applied automatically by the `vercel-build` script during the production build,
   before the new code goes live (additive; if it fails, the build fails and the old deployment stays).
2. **Environment variables on Vercel:**
   - `VAPI_WEBHOOK_SECRET` — set on 18 Oct (sensitive). The same value must go into the Vapi
     assistant's server secret; until then every Vapi request is refused.
   - Encryption uses the existing `ENCRYPTION_SECRET`. Don't change it: values already encrypted
     would become unreadable.
   - Optional: `VOICE_RECORDING_HOSTS` (only if recordings are served from a host other than `*.vapi.ai`).
3. Deploy the code.
4. **Update the Vapi assistant:** tools and structured-output JSON from Settings → AI Voice Agent,
   and check the prompt there (see `docs/voice/vapi-setup.md`). Until the tools are updated,
   booking calls ask for a date of birth they have no field for, so they fail safe but don't book.
5. Open **Settings → System Status** and clear every red item. In particular, if it reports
   "Demo data in Settings", review and save **Practice Information** and **Appointment Types**.
6. In **Knowledge Base**, click **Import website FAQ**.
7. Fill in NIF, ERS number and OMD numbers, and add the Mafra municipal holiday under Closures.

## Follow-up (18 Oct, approved): sign-in security and email links

- **Two-factor sign-in (TOTP)** with any authenticator app. You set it up in Account and confirm it
  with a code. At sign-in, the password is checked first and a code is then asked for. Each code
  works once, and the secret is stored encrypted. The code itself is tested against the RFC 6238
  reference vectors. There is no new dependency.
- **"Require two-factor for administrators"** (Security & Audit): an admin without it can only reach
  `/setup-2fa` until it's set up. Other pages redirect there and APIs return 403 (enforced in
  `proxy.ts`). While the policy is on, nobody can turn it off for themselves. Another admin can
  reset it for a lost phone.
- **Session timeout:** sign-out after 15 min to 4 h of inactivity (default 30), with a warning a
  minute before. It is shared across tabs and ignores background polling. The server enforces the
  same limit for closed tabs and copied cookies, and every sign-in now ends after 12 h (it was 30 days).
- **Email links work:** `proxy.ts` now lets patients reach `/api/email/unsubscribe` and
  `/api/email/view` (signed tokens), and lets SendGrid reach `/api/email/webhook/sendgrid`. That
  webhook now refuses in production without its verification key; it accepted anything before.
  The "view in browser" link pointed at a page that doesn't exist and now points at the real route.
- **Deploying to Vercel runs the migration first:** the `vercel-build` script runs `prisma migrate
  deploy` only for production builds. If the migration fails, the build fails and the previous
  deployment stays live.

## Needs your decision (not done)

| Item | Why it wasn't done |
|---|---|
| Reminders / background worker (deferred by the owner) | Reminders, campaigns and SMS need `npm run worker` plus Redis on a long-running host; this can't run on Vercel. System Status shows whether it's alive. |
| Reconciling lost call reports with Vapi (playbook RES-07) | Needs a Vapi private API key, and should be tested against real payloads. |
| WhatsApp channel | Needs the clinic's WhatsApp Business sender through Twilio first. |
| Website chatbot | Deferred, as agreed. |
| Messaging "Coming soon" lock screen | Product copy, left as it was. |

## Assumptions to confirm (all editable in Settings)
- Durations: evaluation 30 min, hygiene 45 min, restorative/endo 60 min, implant 90 min.
- Acácia may book only evaluation, hygiene and follow-up. Emergencies go to an urgent callback or
  transfer so the team can triage.
- 60 minutes minimum notice for agent bookings; book up to 90 days ahead.
- Late tolerance 15 minutes (the website says 10–15).
- The Guião said nothing about Saturdays, so they are closed.

## Re-running the checks
```bash
npm test                 # unit + route tests (276)
npm run check:stubs      # placeholders / fake data
npm run build && bash scripts/e2e/cycle.sh   # end-to-end on a throwaway database (92 checks)
```

## Files
- **New:** `lib/clinic/*` (time, phone, settings), `lib/voice/*` (auth, identity, contract, tools,
  end-of-call, recordings, delivery log), `lib/auth/*`, `lib/gdpr/*`, `lib/knowledge/*`,
  `lib/notifications/*`, `lib/audit/*`, `lib/email/send.ts`, `lib/messaging/optOut.ts`,
  `components/settings/*`, `components/auth/*`, `components/patients/gdpr-actions.tsx`,
  `app/(dashboard)/callbacks`, and the API routes under `callbacks`, `knowledge`, `audit-logs`,
  `account`, `auth/password-*`, `settings/{clinic,voice-agent,notifications,status,usage}`,
  `call-logs/[id]/recording` and `patients/[id]/{export,erase}`.
- **Migration:** `prisma/migrations/20261017230000_clinic_retrofit_settings_callbacks_webhooks`.
- **Tests:** `tests/clinic/*`, `tests/voice/*`, `tests/auth/*`, `scripts/e2e/*`.

## Production deploy (18 Oct)

- The Supabase database behind production was unreachable ("tenant/user not found", most likely a
  paused or deleted project), so the live CRM could not sign anyone in.
- At the owner's request, production now uses a new **Neon Postgres** database (Vercel Marketplace,
  free plan, Frankfurt `eu-central-1`, connected to production only). Server functions are pinned
  to `fra1` (`vercel.json`), so data and processing stay in the EU.
- All 12 migrations were applied, and `scripts/bootstrap-production.ts` created the Settings row
  (clinic defaults), the website FAQ and one admin with a one-time set-password link. The script
  refuses to run if any user exists.
- **Not migrated:** patients, appointments and logs in the old Supabase project. If it is restored,
  they can be copied into Neon.
- Live checks after deploy: login, auth redirect, database reachable, set-password link valid,
  Vapi refuses requests without the secret and answers with it, unsubscribe link public, SendGrid
  webhook closed without its key.
