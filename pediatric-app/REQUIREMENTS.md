# Patient Messaging System — Requirements Reference

## What We Are Building
A Klara replacement — patient messaging and communication module built natively into the CRM.
Three interfaces: staff inbox (CRM dashboard), patient portal (standalone web), web chat widget (embedded JS).
All channels (SMS, web chat, portal) converge into one unified conversation per patient.

## Stakeholders
- **Staff**: Admin, Provider (Dr. Tamas, Dr. Richards), Nurse (Josh), Front Desk
- **Patients**: Parents/Guardians (primary communicators for ages 0-18)
- **Teens**: Ages 13-18 with limited access per Washington state teen rights
- **Website visitors**: Anonymous users on kids0to18.com

## Core Features by Phase

### Phase 1 — Web Messaging Foundation (No Twilio needed)

**Unified Inbox (Staff CRM)**
- Three-panel layout: conversation list (left), thread view (center), patient context (right)
- Inbox tabs: All, Unassigned, My Inbox, custom shared inboxes (Scheduling, Refills, etc.)
- Conversation list: patient name, last message preview, timestamp, unread badge, assigned staff, status
- Thread view: chronological messages with sender ID, channel indicator (SMS/web/portal/system)
- Message composer: text input, template picker with merge tags, file attach, send button
- Assign/reassign conversations to staff or shared inboxes with notes
- Mark conversations: read/unread, open/resolved/archived
- Search by patient name, phone, message content, date range
- Patient context panel: demographics, appointments, call logs, insurance
- Real-time via Supabase Realtime — new messages appear instantly
- Unread badge in sidebar navigation
- Internal notes (staff-only, invisible to patient) with yellow/amber styling

**Patient Portal**
- Magic link auth via SMS/email — no username, no password, no app download
- DOB verification on first access and every 30 days
- Fallback: portal URL → phone number → SMS code → DOB verify
- Chat-style conversation view (WhatsApp/iMessage UX)
- Patient can send messages and select a reason (Scheduling, Refill, Question, Urgent, etc.)
- 30-day session persistence on same device
- Mobile-first responsive design
- Standalone layout — NO CRM sidebar/header

**Web Chat Widget**
- Floating chat bubble (bottom-right) on practice website
- Visitor provides name + phone + reason before first message
- Messages flow into CRM unified inbox tagged as "Web Chat"
- Real-time replies if visitor is still on site
- Auto-match visitor to existing patient by phone number
- Lightweight JS embed (single script tag, < 50KB gzipped)
- Offline mode outside business hours

**Message Templates**
- CRUD templates with title, category, body text
- Merge tags: {{patient.firstName}}, {{patient.lastName}}, {{patient.parentName}}, {{appointment.date}}, {{appointment.time}}, {{appointment.provider}}, {{appointment.type}}, {{practice.name}}, {{practice.phone}}, {{portal.link}}
- Quick-insert picker in message composer

**Shared Inboxes**
- Create custom team inboxes (Scheduling, Refills, Billing, Clinical)
- Staff subscribe/unsubscribe to inboxes
- Default "Unassigned" inbox for all unrouted messages

**Notifications**
- New message → CRM notification with link to conversation
- Unread count badge on Messaging sidebar item

### Phase 2 — SMS & Automation (Twilio required)

**Two-Way SMS**
- Dedicated practice phone number via Twilio
- Inbound SMS → webhook → match to patient → route to conversation
- Outbound SMS from CRM inbox → Twilio API → patient phone
- Delivery status tracking: queued, sent, delivered, failed
- TCPA opt-in/opt-out (STOP/START keywords)
- Rate limiting per patient per hour

**Automated Workflows**
- Appointment reminders at configurable intervals (48h, 24h, 2h)
- No-show follow-up messages
- Pre-visit instructions by appointment type
- New patient welcome message
- Intake form auto-send on booking
- Rules configurable in Settings: trigger, delay, template, channel, conditions
- Idempotent execution (no duplicate sends)

**Unified Timeline**
- Messages + call logs + emails + forms + appointments in one chronological view per patient

**File Exchange**
- Staff send files/images in conversations
- Patients upload from portal
- Stored encrypted, linked to patient Document record

**Dashboard KPIs**
- Messages today, open conversations, average response time

### Phase 3 — Advanced Features

**Broadcasts**: Bulk messages to patient segments with audience filters
**Analytics**: Response times, channel distribution, volume trends
**Read receipts & typing indicators**
**MMS support** (photos via SMS)
**Escalation alerts** for unresponded conversations
**Teen portal access** with Washington state teen rights compliance

## Non-Functional Requirements
- Real-time delivery < 2 seconds (web), < 5 seconds (SMS API)
- Support 2,000 concurrent patients
- Portal load < 3 seconds on 3G mobile
- AES-256-GCM encryption at rest for all message content
- HIPAA compliant: TLS in transit, encryption at rest, audit logging
- Widget < 50KB gzipped
- Graceful degradation when SMS provider is unavailable
