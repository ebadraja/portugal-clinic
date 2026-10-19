# Zappy → CRM cutover runbook

What to do, in order, to move the clinic from Zappy to the CRM agenda. Background and design are in
[2026-10-19-zappy-replacement-plan.md](2026-10-19-zappy-replacement-plan.md).

Nothing below changes what patients or staff see until step 4: the new agenda and reminders are off
by default (Settings → Agenda & Reminders).

## 1. Deploy (any time)

1. Push the code. The `vercel-build` script applies the migration `20261019120000_agenda_reminders_outbox`
   before the new code goes live. It is additive (new tables and columns; `date_of_birth` becomes optional).
2. Add these environment variables on Vercel, then redeploy:
   - `CRON_SECRET`: a long random value (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, if they're not set yet.
   - Optional: `PUBLIC_APP_URL`, if patient links should use a different domain than `NEXTAUTH_URL`.
3. Create the frequent trigger on **cron-job.org** (free):
   - URL: `https://<crm-domain>/api/cron/dispatch`, method GET
   - Header: `Authorization: Bearer <CRON_SECRET>`
   - Schedule: every 10 minutes, 08:00–21:00, time zone Europe/Lisbon
   - Use "Test run": it should answer `{"ok":true,…}`.

   The daily Vercel Cron in `vercel.json` is the backstop. On a Vercel Pro plan, you can instead set
   `"schedule": "*/10 7-20 * * *"` in `vercel.json` (UTC) and skip cron-job.org.
4. In **Settings → Practice Information → Dentists & hygienists**, set each person's colour, working
   hours (split shifts allowed), the appointment types they do, whether Acácia may book them, and their
   staff login (this gives them "my agenda").
5. In **Settings → AI Voice Agent**, copy the regenerated tool JSON into the Vapi assistant.
   `check_availability` and `book_appointment` gained an optional `provider` argument.

## 2. Configure reminders (any time before cutover)

**Settings → Agenda & Reminders:**
- Check the timing (default: confirmation when booked, plus a reminder the day before at 10:00; no same-day reminder) and the SMS texts. The preview shows characters and SMS parts; keep each text to one SMS.
- Use **Send a test** for an SMS to your own phone and an email to your own inbox. Open the link in the SMS: the patient page should show the sample appointment.
- **Sending health** should be all green. The dispatcher line turns green after the first cron run.

## 3. Rehearse the import (a week before)

1. In Zappy, export **clients** (Excel) and the **appointments list** ("Listagem de marcações") for the
   last 2–3 years plus everything in the future. Open each in Excel and use **Save As → CSV UTF-8**.
   If the appointments export isn't available, ask Zappy support for it (or for a Public API key).
   Under GDPR art. 20 the clinic is entitled to its data in a machine-readable format.
2. Copy `scripts/zappy-map.example.json` to `scripts/zappy-map.json`.
3. Dry run against a **Neon branch** (a free copy of production: Neon console → Branches → Create),
   with `DATABASE_URL` pointing at the branch:
   ```bash
   npx tsx scripts/import-zappy.ts --clients clientes.csv --bookings marcacoes.csv --map scripts/zappy-map.json
   ```
   It writes nothing. It prints which columns it recognised, services and staff missing from the
   mapping file, bookings by status, and upcoming appointments per day. The row-by-row detail is in
   `zappy-import-report.csv`.
4. Add the missing services and staff to `zappy-map.json` and repeat until the "not in the mapping
   file" lists are empty or acceptable.
5. Run it with `--commit` on the branch, then open the agenda on the branch deployment and compare a
   few days with Zappy.
6. Run it with `--commit` on **production**. The agenda is still off, so staff can train on real data
   at `/appointments?agenda=1` while Zappy remains the live system.

## 4. Cutover (Friday after closing)

1. **In Zappy:** switch off online booking, SMS/email reminders and the AI phone assistant.
2. Export clients and appointments again and run the importer with `--commit --cancel-missing` on
   production. Re-running only updates what changed. `--cancel-missing` cancels upcoming bookings
   that were deleted in Zappy since the rehearsal.
3. Compare **upcoming appointments per day** (printed by the importer) with the Zappy agenda for the
   next two weeks.
4. **Settings → Agenda & Reminders:** turn on **New agenda**, then **Patient confirmations &
   reminders**. Turning reminders on plans day-before reminders for every upcoming appointment, so
   patients get one reminder from the CRM and none from Zappy.
5. If the clinic number forwarded to Zappy's assistant, point it at the Vapi number.
6. Test with a test patient:
   - book at the desk, move it by dragging, cancel it
   - book by phone with Acácia
   - check the confirmation SMS arrives, and that its link confirms

## 5. First two weeks

- Look at **Settings → System Status** each morning. It shows the reminder dispatcher, failed messages and late messages.
- Failed messages are listed in each appointment's drawer (wrong number, no credit…).
- Keep Zappy read-only for 1–3 months as a reference.

## Rollback

- Switch off **New agenda** and the old appointments page returns. Switch off **reminders** and
  everything pending is cancelled.
- Zappy still has everything up to the cutover. Re-enable its reminders and bookings.
- CRM bookings made since cutover are in the agenda (list view, printable) and in the
  `appointments` table (`booked_via` ≠ `IMPORT`).
