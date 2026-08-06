# GIGI Chatbot — Implementation Plan (Vapi Chat API + Custom Widget)

## Overview

Build an embeddable website chatbot for Kids 0-18 Integrative Pediatrics. The chatbot is **GIGI**, the practice's cartoon giraffe mascot. It embeds on the practice's Webflow website (www.kids0218.com) via a single `<script>` tag.

**Critical architectural principle: GIGI already exists.** GIGI is a fully configured Vapi assistant with:
- A system prompt built from 1,930 real call transcripts
- A knowledge base (303 Q&A pairs, 16 insurance plans, escalation rules)
- 9 custom tools living in the existing webhook handler at `app/api/webhooks/vapi/route.ts`:
  `lookup_patient`, `check_availability`, `book_appointment`, `cancel_appointment`,
  `verify_insurance`, `submit_refill_request`, `send_intake_forms`,
  `create_callback_request`, `transfer_to_human`
- Tools secured by the `x-vapi-secret` header (`VAPI_WEBHOOK_SECRET` env var)

**We do NOT rebuild any of this.** The chatbot reuses the same GIGI assistant via Vapi's **Chat API**. Every tool call the chat triggers flows through the SAME existing webhook. Any change to GIGI's prompt/knowledge base automatically applies to BOTH voice calls and the website chatbot. One brain, two channels (voice + chat).

The widget has **two tabs**:
1. **GIGI AI Assistant** (BUILD NOW) — Vapi-powered chat + custom visual appointment calendar
2. **Secure Messaging** (LOCKED — build after M8/M9) — phone+OTP+DOB verified patient messaging

---

## CRITICAL SECURITY CONSTRAINT — Read First

The Vapi Chat API (`POST https://api.vapi.ai/chat`) authenticates with your **PRIVATE API key** via `Authorization: Bearer YOUR_PRIVATE_KEY`. 

**The private key MUST NEVER appear in client-side code** (the widget JS is publicly visible on the website). 

Therefore the widget does NOT call Vapi directly. The data flow is:

```
[Widget on Webflow site]
      |  POST /api/chatbot/message  (no secrets, public CORS endpoint)
      v
[CRM backend: app/api/chatbot/message/route.ts]
      |  POST https://api.vapi.ai/chat  (adds private key server-side)
      v
[Vapi Chat API — runs GIGI assistant]
      |  when GIGI calls a tool (e.g. check_availability)
      v
[CRM webhook: app/api/webhooks/vapi/route.ts]  (existing, unchanged)
      |  hits existing CRM APIs, returns tool result to Vapi
      v
[Vapi returns GIGI's text reply]
      |
      v
[CRM backend returns reply to widget]
```

So we build a **thin proxy endpoint** on the CRM that forwards messages to Vapi's Chat API and returns GIGI's replies. The private key stays server-side. The existing webhook handles all tool execution exactly as it does for voice — nothing there changes.

---

## File Structure (new files)

```
public/
  gigi-chatbot.js              ← Self-contained widget (HTML/CSS/JS injected, no deps)
  gigi-avatar.png              ← Giraffe mascot headshot (extract from doctor's video)

app/api/chatbot/message/
  route.ts                     ← PROXY to Vapi Chat API (holds private key server-side)

app/api/chatbot/availability/
  route.ts                     ← Public availability for the visual calendar (GET, no PHI)

app/api/chatbot/book/
  route.ts                     ← Public booking endpoint (POST, creates appointment)
```

Note: `app/api/webhooks/vapi/route.ts` is NOT modified. The 9 tools already work there.

---

## Phase 1: GIGI AI Chat Tab (BUILD NOW)

### 1.1 — The Proxy Endpoint (`app/api/chatbot/message/route.ts`)

This is the heart of Option 2. It forwards widget messages to GIGI via Vapi's Chat API.

**Endpoint:** `POST /api/chatbot/message`

**Request from widget:**
```typescript
{
  sessionId: string;          // UUID generated client-side, stored in localStorage
  message: string;            // The user's text
  previousChatId?: string;    // Vapi's chat ID from the previous turn (for context)
}
```

**Server-side logic:**
```typescript
// Pseudocode
export async function POST(req) {
  // 1. CORS check — only allow www.kids0218.com (+ Webflow staging + localhost in dev)
  // 2. Rate limit by sessionId (e.g. 30 msgs/hour)
  // 3. Forward to Vapi Chat API with PRIVATE key
  const vapiRes = await fetch('https://api.vapi.ai/chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      assistantId: process.env.GIGI_ASSISTANT_ID,
      input: message,
      ...(previousChatId ? { previousChatId } : {}),
      // Optional: pass dynamic variables GIGI's prompt expects (e.g. current date)
      assistantOverrides: {
        variableValues: {
          now: new Date().toISOString(),
          // any other {{variables}} GIGI's system prompt uses
        },
      },
    }),
  });

  const data = await vapiRes.json();
  // data.output is an array of assistant messages
  // data.id is the chatId to send back as previousChatId next turn

  // 4. Detect if GIGI wants to show the calendar.
  //    The cleanest signal: GIGI's reply mentions booking / the check_availability
  //    tool ran. See 1.5 for how to surface this to the frontend.

  return NextResponse.json({
    reply: data.output.map(m => m.content).join('\n'),
    chatId: data.id,
    // action field populated if we detect a booking intent (see 1.5)
  }, { headers: corsHeaders });
}
```

**Key points:**
- `VAPI_PRIVATE_KEY` and `GIGI_ASSISTANT_ID` are server-side env vars, never sent to the client.
- `previousChatId` is how Vapi maintains conversation context across turns — store it client-side and send it back each turn. (We do NOT need to send full conversation history; Vapi tracks it via chat ID.)
- When GIGI calls `check_availability` or `book_appointment` during the chat, those tool calls hit the EXISTING webhook automatically — Vapi handles that round-trip internally. We don't orchestrate tools here.

### 1.2 — How the visual calendar fits with Vapi's tools

There are two valid approaches. Pick **Approach A** for the best UX.

**Approach A (recommended) — Custom calendar UI, GIGI hands off to it:**
- GIGI (via chat) handles the conversation: greeting, answering questions, understanding the parent wants to book.
- When the parent expresses booking intent, the WIDGET detects this (either from a quick-action button tap, or from GIGI's reply signaling booking) and renders the custom visual calendar UI.
- The visual calendar calls the dedicated public endpoints `/api/chatbot/availability` and `/api/chatbot/book` directly (NOT through Vapi). This gives a slick, instant, clickable calendar instead of GIGI reading slots as text.
- After booking succeeds, the widget can post a confirmation back into the chat thread ("✅ Booked! Wed Jun 24 at 9:30 AM") and optionally tell GIGI via a follow-up message so the conversation stays coherent.

Rationale: Vapi tools were designed for VOICE, where the agent speaks slots aloud. On a screen, a clickable calendar is far better UX than GIGI listing times in text. So we let GIGI converse, but hand the actual scheduling to a purpose-built visual component backed by the same CRM availability data.

**Approach B — Pure Vapi, GIGI drives everything in text:**
- Everything goes through the Vapi Chat API including booking. GIGI calls `check_availability`, gets slots, lists them as text, the user types a choice, GIGI calls `book_appointment`.
- Simpler to build (no custom calendar) but worse UX — no visual calendar, just text back-and-forth.
- Use this only if you want to ship the absolute minimum first.

**This plan implements Approach A.** The trigger for showing the calendar is the quick-action "Book an Appointment" button plus intent detection in GIGI's replies.

### 1.3 — Widget Shell (`public/gigi-chatbot.js`)

Single self-executing IIFE that injects everything. Configurable via data attributes:

```html
<script
  src="https://app.kids0218.com/gigi-chatbot.js"
  data-api-url="https://app.kids0218.com"
  defer>
</script>
```

No public keys in the tag — all secrets live on the CRM backend. The widget only knows the CRM's public API URL.

**UI structure:**
```
[Floating Giraffe Bubble]  → bottom-right, fixed, 70px circle, bounce + pulse
        │ click
        v
[Chat Window 400×600 desktop / fullscreen mobile]
  ┌────────────────────────────────┐
  │ Header: GIGI avatar + name +   │  ← purple gradient, "Online" dot, close X
  │         "AI Assistant"         │
  ├────────────────────────────────┤
  │ Tabs: [GIGI] [Messaging 🔒]    │  ← Tab 2 locked, shows "coming soon"
  ├────────────────────────────────┤
  │ Message thread (scrollable)    │
  │  - GIGI bubbles (left+avatar)  │
  │  - User bubbles (right, purple)│
  │  - Typing indicator (3 dots)   │
  │  - Inline calendar card        │  ← rendered here during booking
  │  - Quick-action chips          │
  ├────────────────────────────────┤
  │ [input............] [send →]   │
  └────────────────────────────────┘
```

### 1.4 — Giraffe Bubble + Animations

Bubble = the doctor's purple giraffe mascot, cropped to a 70px circle (60px mobile), 3px white border, drop shadow, `z-index: 99999`, fixed bottom-right 24px from edges.

CSS keyframes (all gated behind `@media (prefers-reduced-motion: no-preference)`):
```css
@keyframes gigi-bounce {
  0%,100% { transform: translateY(0); }
  50%     { transform: translateY(-4px); }
}
@keyframes gigi-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(124,58,237,0.4); }
  70%  { box-shadow: 0 0 0 15px rgba(124,58,237,0); }
  100% { box-shadow: 0 0 0 0 rgba(124,58,237,0); }
}
@keyframes gigi-slide-up {
  from { opacity:0; transform: translateY(20px) scale(0.95); }
  to   { opacity:1; transform: translateY(0) scale(1); }
}
```
- Idle bounce: every 3s, subtle.
- Pulse ring: first 10s after page load to attract attention, then stop.
- Hover: scale(1.1) with spring easing.
- Open: chat window slides up.
- Closed-with-reply: small red dot badge on bubble.

### 1.5 — Color & Type System

Palette (pediatric, warm, matches purple giraffe):
- Primary `#7C3AED`, Primary-light `#EDE9FE`
- GIGI bubble bg `#F3F0FF`, dark text `#1F2937`
- User bubble `#7C3AED` + white text
- Header gradient `linear-gradient(135deg,#7C3AED,#A855F7)`
- Muted `#6B7280`, white `#FFFFFF`

Type: `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`. Messages 14px/1.5, timestamps 11px muted, header 16px semibold.

### 1.6 — Conversation Flow

Auto-greeting on first open (from GIGI, rendered locally so it's instant — no API call needed for the greeting):
```
Hi there! 🦒 I'm GIGI, the virtual assistant for Kids 0 to 18
Integrative Pediatrics. I can help with:

• Scheduling appointments
• Insurance & billing questions
• Office hours & location
• Services we offer

How can I help you today?
```
Quick-action chips below greeting: `Book an Appointment` · `Insurance Questions` · `Office Hours` · `Contact Us`.

- Tapping a chip OR typing → sends to `/api/chatbot/message` → GIGI replies.
- Tapping "Book an Appointment" → widget opens the visual calendar (1.7) instead of a text round-trip.
- If GIGI's text reply indicates booking intent (e.g. contains a booking keyword/marker), the widget can also auto-open the calendar.

### 1.7 — Visual Calendar (inline card, Approach A)

Rendered as a card inside the message thread, 6 steps, purple theme, mobile-friendly (44px tap targets):

1. **Appointment type** — tappable cards: Well-Child Visit, Sick Visit, Follow-Up, New Patient Consultation, Other
2. **Provider** — Dr. Jonathan Tomas (APRN), Dr. Peaches Richards, No Preference
3. **Date** — scrollable week strip, ● = has slots / ○ = none, arrows to change week
4. **Time** — pills grouped Morning/Afternoon, fill on select
5. **Details** — Child's name, Child's DOB, Parent name, Parent phone, Parent email (optional), New-patient checkbox, honeypot anti-bot field
6. **Confirmation** — ✅ summary + "Book Another" / "Close"; posts a confirmation line back into the chat thread

Step indicator dots at top, back button between steps, slide-left transitions.

### 1.8 — Public Availability Endpoint (`app/api/chatbot/availability/route.ts`)

`GET /api/chatbot/availability?provider=<id>&date=<YYYY-MM-DD>&range=7`

- Public (no auth), CORS-restricted to www.kids0218.com (+ Webflow staging).
- Reuses the SAME availability logic as the existing `/api/appointments/availability` endpoint the voice tools use.
- Returns ONLY slot availability — zero PHI.
```typescript
{
  provider: string;
  slots: { date: string; dayOfWeek: string;
           times: { time: string; available: boolean }[] }[];
}
```

### 1.9 — Public Booking Endpoint (`app/api/chatbot/book/route.ts`)

`POST /api/chatbot/book`
```typescript
{
  appointmentType, providerId, date, time,
  childName, childDob, parentName, parentPhone,
  parentEmail?, isNewPatient, sessionId, honeypot
}
```
Logic:
1. Validate fields; reject if honeypot filled (bot).
2. Re-check slot availability (race guard).
3. Match existing patient by childName+childDob+parentPhone; else create new Patient + parent contact.
4. Create Appointment via the SAME path `book_appointment` tool uses (`POST /api/appointments`) for consistency.
5. Return confirmation + ID.
6. Fire a CRM staff notification: "New appointment booked via GIGI chatbot" (reuse existing notifications system).

Guards: rate-limit 5 bookings/phone/day, honeypot, server-side slot re-validation.

---

## Phase 2: Secure Messaging Tab (LOCKED — DO NOT BUILD YET)

Tab 2 is visible but shows a "coming soon" panel when clicked:
```
🔒 Secure Patient Messaging
This feature is coming soon. Soon you'll be able to securely
message your provider here. For now, call (253) 400-4479 or ask GIGI!
```

When M8 (SMS/Twilio) + M9 are done, Tab 2 will implement (separate task):
1. Phone entry → Twilio SMS OTP → enter code
2. Select child → enter child's DOB → verify against CRM record (mirrors how Klara verifies identity: phone + OTP + DOB)
3. On success → show the secure conversation thread (same thread staff see in the CRM inbox)
4. Multiple guardians per patient, distinguished by phone number (needs a Guardian/PatientContact model — two parents, one child)
5. Messages here ARE stored in CRM and visible to staff

This is the actual Klara webchat replacement. Build only after backend messaging + Twilio are live.

---

## Webflow Integration

1. Host on the CRM server: `https://app.kids0218.com/gigi-chatbot.js` and `gigi-avatar.png`.
2. Webflow → Project Settings → Custom Code → Footer Code:
```html
<script src="https://app.kids0218.com/gigi-chatbot.js"
        data-api-url="https://app.kids0218.com" defer></script>
```
3. Widget self-initializes on load. No keys in the page.

### CORS
Restrict `/api/chatbot/*` to:
```typescript
const CHATBOT_ALLOWED_ORIGINS = [
  'https://www.kids0218.com',
  'https://kids0218.com',
  'https://kids-0-to-18-integrative-pediatrics.webflow.io',
  'http://localhost:3000',
];
```

---

## Mobile Responsiveness (breakpoint 768px)

- Mobile: chat = 100% width, 100vh full-screen overlay; bubble 60px; calendar week strip scrolls horizontally; time pills 2-col; input sticky bottom with iOS safe-area padding.
- Desktop: 400×600 anchored bottom-right.

---

## Session Persistence (localStorage key `gigi_chatbot`)
```typescript
{
  sessionId: string;        // UUID, first open
  vapiChatId?: string;      // Vapi previousChatId for context continuity
  hasSeenGreeting: boolean;
  lastActive: number;
}
```
Clear after 24h inactivity (Vapi sessions also expire at 24h).

---

## Environment Variables (CRM server `.env`)
```env
VAPI_PRIVATE_KEY=<your Vapi PRIVATE api key>     # server-side only, NEVER in widget
GIGI_ASSISTANT_ID=<GIGI's Vapi assistant id>
VAPI_WEBHOOK_SECRET=<existing — already set for the 9 tools>
CHATBOT_CORS_ORIGINS=https://www.kids0218.com,https://kids0218.com,https://kids-0-to-18-integrative-pediatrics.webflow.io,http://localhost:3000
CHATBOT_RATE_LIMIT=30
```

---

## Implementation Order for Cursor

1. **`app/api/chatbot/message/route.ts`** — proxy to Vapi Chat API using `VAPI_PRIVATE_KEY` + `GIGI_ASSISTANT_ID`; CORS + rate limit; returns `{reply, chatId, action?}`. Verify GIGI's existing assistant ID and that the 9 tools still fire through the existing webhook during a chat (test by asking GIGI to check availability in a curl call to your proxy).
2. **`app/api/chatbot/availability/route.ts`** — public, reuses existing availability logic, PHI-free.
3. **`app/api/chatbot/book/route.ts`** — public booking, reuses existing `POST /api/appointments` path, with anti-abuse guards + staff notification.
4. **`public/gigi-chatbot.js`** — full widget: giraffe bubble + animations, chat window, two tabs (Tab 2 locked), message rendering with GIGI avatar, typing indicator, quick-action chips, 6-step visual calendar (Approach A), localStorage session w/ vapiChatId, mobile responsive, prefers-reduced-motion.
5. **CORS** for `/api/chatbot/*`.
6. **Test locally** on a standalone HTML page (different origin) to confirm CORS + flow.
7. **Deploy to Hostinger** — build, `pm2 restart kids018-crm`, verify the JS + avatar are served and the proxy reaches Vapi.
8. **Add the script tag to Webflow** footer; test on the live HTTPS site.

---

## Testing Checklist
- [ ] Widget loads cross-origin (Webflow domain) with no console errors
- [ ] Private key never appears in any client-side network request or JS
- [ ] GIGI greeting renders instantly (local, no API call)
- [ ] Typing a question → proxy → Vapi → GIGI replies with correct knowledge-base answers
- [ ] Conversation context persists across turns (vapiChatId / previousChatId works)
- [ ] Asking GIGI about insurance/hours/services returns the SAME answers as the voice agent
- [ ] "Book an Appointment" opens the visual calendar
- [ ] Calendar shows REAL availability from CRM (matches what voice tools return)
- [ ] All 6 booking steps work; booking creates a real Appointment in the DB
- [ ] Staff gets a "booked via GIGI chatbot" notification
- [ ] No PHI is ever exposed through the chatbot
- [ ] Tab 2 shows "coming soon" panel
- [ ] Mobile = full-screen chat, large tap targets
- [ ] Rate limiting + honeypot block abuse
- [ ] CORS blocks non-kids0218.com origins
- [ ] Giraffe bounce/pulse/hover animations work; reduced-motion disables them

---

## What This Does NOT Include (future)
- Secure messaging Tab 2 (blocked on M8 Twilio OTP)
- Guardian/PatientContact model for two-parent linking (needed for Tab 2)
- MMS/photo + file upload in chat
- Voice mode in the widget (Vapi voice SDK) — doctor said no voice for now
- Storing anonymous chat transcripts in the CRM (not stored for now)

---

## Quick Sanity Note on the "two lines" alternative
Vapi also ships a prebuilt `<vapi-widget mode="chat">` you can drop in with two lines. It works and uses GIGI's assistant, but you CANNOT get the giraffe bubble, the visual calendar, or the two-tab layout with it. That's why we're building the custom widget (Approach A) instead. If you ever want something live in 10 minutes as a stopgap, the prebuilt widget is the fallback — but it's not the deliverable the doctor described.
