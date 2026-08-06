# Patient Messaging — Implementation Report

**Project:** Kids 0–18 Integrative Pediatrics CRM (Klara replacement)  
**Report date:** June 14, 2026  
**Status:** M0–M7 + **M10 complete** · M8/M9+ **pending** (Twilio + HIPAA BAA required for SMS)

---

## Executive summary

Phase 1 delivers a **unified staff inbox**, **patient portal chat**, and **embeddable web chat widget** — all without Twilio. Staff can reply to patients across portal and web chat channels, use templates, route to shared inboxes, and see patient context beside each thread.

**M10** (just completed) adds a **cross-module patient timeline**, **automatic system messages** from Vapi voice bookings/cancellations and HIPPAtizer form submissions, **HIPPAtizer form-link sending** from the composer, and **messaging KPIs** on the main dashboard.

SMS (M8), full automation (M9), file exchange (M11), and broadcasts (M12+) remain **out of scope** until Twilio and a signed BAA are in place.

---

## Milestone completion matrix

| Milestone | Status | Summary |
|-----------|--------|---------|
| **M0** Security baseline | ✅ Complete | AES-256-GCM encryption, `proxy.ts` route whitelist |
| **M1** Database schema | ✅ Complete | 10 messaging models + migration |
| **M2** Core messaging API | ✅ Complete | Conversations, messages, assign, audit |
| **M3** Staff unified inbox | ✅ Complete | 3-panel inbox UI + sidebar nav |
| **M4** Patient portal | ✅ Complete | Phone OTP auth + `/portal/chat` |
| **M5** Web chat widget | ✅ Complete | `webchat-widget.js` + session persistence |
| **M6** Realtime & notifications | ✅ Complete | 2s polling, staff notifications, unread badge |
| **M7** Templates & settings | ✅ Complete | Templates CRUD, shared inboxes, settings tab |
| **M8** SMS (Twilio) | ⏸ Pending | Blocked — no Twilio / BAA |
| **M9** Automated messaging | ⏸ Pending | Depends on M8 for SMS rules |
| **M10** Timeline & integrations | ✅ Complete | Timeline API/UI, Vapi/HIPPAtizer hooks, dashboard KPIs |
| **M11+** Files, broadcasts, advanced | ⏸ Pending | Phase 2/3 |

---

## Features implemented (by area)

### Security & infrastructure (M0)

- **AES-256-GCM** message encryption in `lib/crypto.ts`
- Public route whitelist in `proxy.ts`: `/portal/*`, `/api/portal/*`, `/api/webchat/*`
- Message content encrypted at rest before database write

### Data layer (M1)

Prisma models: `Conversation`, `Message`, `SharedInbox`, `SharedInboxMember`, `MessageTemplate`, `MessagingAutomationRule`, `ConversationAssignmentLog`, `PatientPortalSession`, `Broadcast`, `SMSOptOut`

Migration: `prisma/migrations/20260614150000_add_messaging_system/`

### Staff messaging API (M2)

| Endpoint | Purpose |
|----------|---------|
| `GET/POST /api/messaging/conversations` | List / create conversations |
| `GET/PATCH /api/messaging/conversations/[id]` | Detail, mark read, status |
| `GET/POST /api/messaging/conversations/[id]/messages` | Thread + send reply / internal note |
| `POST /api/messaging/conversations/[id]/assign` | Assign staff or shared inbox |
| `GET /api/messaging/unread-count` | Sidebar badge count |

Libraries: `lib/messaging/session.ts`, `schemas.ts`, `router.ts`, `serialize.ts`, `mergeTags.ts`

### Staff unified inbox UI (M3)

**Route:** `/messaging`, `/messaging/[conversationId]`

**Components:**
- `MessagingInbox` — master layout with list + thread + context panel
- `ConversationList` — conversation rows with preview, unread, status
- `ConversationThread` — message history, assign/resolve/archive actions
- `MessageComposer` — reply vs internal note modes
- `MessageBubble` / `InternalNote` — channel badges, system event styling
- `PatientContextPanel` — patient demographics, appointments, calls
- `InboxTabs` — All / Unassigned / Mine / shared inbox tabs
- `AssignmentDialog` — assign to user or shared inbox

**Sidebar:** New **Messaging** nav item with live unread count badge

### Patient portal (M4)

**Routes:** `/portal`, `/portal/verify`, `/portal/chat`, `/portal/chat/[token]`

**Flow:** Parent enters patient phone → SMS OTP (dev code in API response) → authenticated chat session

**API:** `/api/portal/auth`, `session`, `settings`, `messages`

**Components:** `PortalAuth`, `PortalChat`, `PortalHeader`, `PortalMagicLink`

Portal layout is standalone (no CRM dashboard chrome).

### Web chat widget (M5)

- **`public/webchat-widget.js`** — embeddable bubble for practice website
- **`public/webchat-test.html`** — local test page
- **API:** `POST /api/webchat/init`, `GET/POST /api/webchat/message`
- Patient matching by phone (`lib/messaging/patientMatcher.ts`)
- Session token + `conversationId` persisted in `localStorage` (fixes 403 session mismatch)
- Business hours auto-reply (`lib/messaging/businessHours.ts`)

### Realtime & notifications (M6)

- **`useMessagingPoll`** — 2-second polling (Supabase Realtime optional later)
- Staff **in-app notifications** on new patient messages and assignments
- Sidebar Messaging badge updates via `/api/messaging/unread-count`

### Templates, shared inboxes, settings (M7)

**API:**
- `GET/POST /api/messaging/templates`, `PATCH/DELETE .../[id]` (with `?preview=true&patientId=`)
- `GET/POST /api/messaging/shared-inboxes`, subscribe endpoints
- `GET/PATCH /api/settings/messaging`

**UI:**
- `TemplatePicker` in composer (merge tags: patient name, practice name, etc.)
- **Settings → Patient Messaging** tab (`MessagingSettingsTab`): enable module, portal/widget config, routing rules, template CRUD, inbox subscriptions
- Date-range filter on conversation list (`dateFrom`, `dateTo`)
- Default shared inboxes auto-seeded: Scheduling, Refills, Clinical, Billing

### Unified timeline & integrations (M10) — NEW

**API:**
- `GET /api/messaging/timeline/[patientId]` — chronological merge of messages, appointments, call logs, emails, intake forms
- `POST /api/messaging/conversations/[id]/form-link` — staff sends HIPPAtizer link as `FORM_LINK` system message

**Libraries:**
- `lib/messaging/systemMessages.ts` — `appendSystemMessage()` for Vapi/HIPPAtizer/composer events
- `lib/messaging/timeline.ts` — `buildPatientTimeline()`, `computeMessagingKpis()`

**Integrations:**
- **Vapi** `book_appointment` / `cancel_appointment` tools → system message in patient conversation
- **HIPPAtizer** webhook → system message when form auto-matches to patient (`linkedPatientId`)

**Dashboard KPIs** (new section on `/dashboard`):
- Messages today
- Open conversations (OPEN + AWAITING_REPLY)
- Average first staff response time (minutes)

---

## UI changes & additions (visual map)

```
CRM Sidebar
  └── Messaging (+ unread badge)          [M3, M6]

/dashboard
  └── Patient Messaging KPI row (3 cards) [M10]

/messaging
  ├── Inbox tabs (All / Unassigned / Mine / Shared) [M3, M7]
  ├── Search + date range filters                  [M7]
  ├── Conversation list                            [M3]
  ├── Thread + composer                            [M3]
  │     ├── Reply / Internal Note toggle           [M3]
  │     ├── Template picker                        [M7]
  │     └── Form link button + inline form         [M10]
  └── Right panel: Context | Timeline tabs           [M3, M10]
        ├── Patient info, appointments, calls        [M3]
        └── Unified timeline (icons by event type) [M10]

/settings → Patient Messaging tab                    [M7]
  ├── Enable messaging module
  ├── Portal / widget configuration
  ├── Routing rules
  ├── Message templates CRUD
  └── Shared inbox subscriptions

/portal (standalone)
  ├── Phone auth                                     [M4]
  └── Chat thread                                    [M4]

External website
  └── webchat-widget.js floating bubble              [M5]
```

### Message bubble styling

| Sender | Appearance |
|--------|------------|
| Staff | Blue bubble, right-aligned |
| Patient | White/dark bubble with channel badge (Portal, Web Chat) |
| System | Centered gray pill — appointments, form events, form links |
| Internal note | Amber staff-only note (never sent to patient) |

**FORM_LINK messages** render as clickable title + URL in the thread [M10].

---

## Bugs fixed during implementation

| Issue | Fix |
|-------|-----|
| Build fail: invalid `Role` values in notifications | Use `ADMIN` + `STAFF` only |
| Webchat 403 "Session mismatch" | Persist `conversationId` + `sessionToken` in widget localStorage |
| Missing `MessagingSettingsTab.tsx` after approval | Recreated component |
| Shared inbox tabs missing (Scheduling, Billing) | Show all inboxes in tabs; subscription only in Settings |

---

## Tests

| File | Coverage |
|------|----------|
| `tests/messaging/messagingLib.test.ts` | Serialize, merge tags |
| `tests/messaging/portalAuth.test.ts` | Portal session helpers |
| `tests/messaging/notifications.test.ts` | Staff notification routing |

Run: `npm test -- --run tests/messaging`

---

## Deployment checklist

```bash
cd /var/www/kids018-crm
git pull origin master
npm install && npx prisma generate && npx prisma migrate deploy
npm run build
pm2 restart kids018-crm && pm2 restart kids018-worker
```

**Post-deploy:**
1. Settings → Patient Messaging → enable `messagingEnabled`
2. Configure portal URL and webchat widget snippet for production domain
3. Test portal login with a seeded patient phone
4. Test webchat at `/webchat-test.html` (update `data-api-base` to production URL)

---

## What is NOT implemented (pending)

| Item | Blocker / note |
|------|----------------|
| **M8 SMS outbound/inbound** | Twilio account + HIPAA BAA |
| **M9 automation rules (SMS)** | Requires M8 |
| **M9 appointment reminders via SMS** | Requires M8 |
| **M11 file attachments** | Storage BAA (Supabase/S3) |
| **M12 broadcasts** | SMS part needs M8 |
| **M13 advanced** (read receipts, SLA) | Phase 3 |
| Supabase Realtime (vs polling) | Optional upgrade |
| Timeline on patient detail page | Available via messaging context panel; patient record page not yet wired |

---

## Key file index

### New in M10
- `lib/messaging/systemMessages.ts`
- `lib/messaging/timeline.ts`
- `app/api/messaging/timeline/[patientId]/route.ts`
- `app/api/messaging/conversations/[id]/form-link/route.ts`
- `components/messaging/PatientTimeline.tsx`

### Modified in M10
- `app/api/webhooks/vapi/route.ts`
- `app/api/webhooks/hippatizer/route.ts`
- `app/api/dashboard/route.ts`
- `app/(dashboard)/dashboard/page.tsx`
- `components/messaging/PatientContextPanel.tsx`
- `components/messaging/MessageComposer.tsx`
- `components/messaging/MessageBubble.tsx`
- `components/messaging/ConversationThread.tsx`
- `components/messaging/MessagingInbox.tsx`

### Phase 1 core (M0–M7)
- `app/(dashboard)/messaging/**`
- `app/portal/**`
- `app/api/messaging/**`
- `app/api/portal/**`
- `app/api/webchat/**`
- `components/messaging/**`
- `components/portal/**`
- `lib/messaging/**`
- `public/webchat-widget.js`
- `types/messaging.ts`

---

## Recommended next steps

1. **Deploy M10** to production VPS and verify dashboard KPIs populate
2. **Test integrations:** book/cancel via Vapi voice agent → confirm system message in `/messaging`
3. **Test HIPPAtizer:** submit form for matched patient → system message + timeline intake event
4. When ready for SMS: procure Twilio + BAA → start **M8**
5. Optional: add timeline tab to `/patients/[id]` detail page (reuse `PatientTimeline` component)

---

*Generated from `MESSAGING_IMPLEMENTATION_PLAN.md` v1.5 — Phase 1 + M10 complete.*
