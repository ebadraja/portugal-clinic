# Bug Report: GIGI Widget Messaging Tab & Standalone Webchat — Visitor Identity / Session Issues

**Project:** Kids 0–18 Integrative Pediatrics CRM  
**Date:** June 21, 2026  
**Reporter:** Ebad (practice owner)  
**Severity:** High — blocks confident launch of public-facing messaging on Webflow site  
**Status:** UNRESOLVED — reporter confirms issue persists after multiple fix attempts  

---

## 1. Summary (one paragraph)

The GIGI widget’s **Messaging** tab (and sometimes the standalone webchat widget) does not reliably enforce visitor identity verification before showing a chat interface. Users report being taken directly to an empty chat composer (“Type a message…”) without completing name/phone/reason intake, or without SMS/DOB verification they expect from earlier testing. Session state in browser storage is confusing: deleting `localStorage` does not behave as expected because **two separate keys** exist (`gigi_chatbot` vs `kids018_webchat`), and production may be serving **older JavaScript** than the local git repo. Multiple client-side fixes were attempted in `public/webchat-core.js` and `public/gigi-chatbot.js` but the reporter states the problem is **still not fixed** on the live Webflow site.

---

## 2. Reporter symptoms (verbatim issues)

1. **Messaging tab skips authentication** — clicking Messaging goes straight to chat UI, not intake form.
2. **No phone prompt, no DOB verification** on website widget (user expected SMS auth like portal).
3. **Standalone widget (`webchat-test.html`)** — same problem, not GIGI-only.
4. **Incognito / fresh browser** — still treated as authenticated (reporter claim; partial contradiction with one test screenshot — see Evidence).
5. **Deleting localStorage** — `sessionId` under `gigi_chatbot` reappears after refresh; user thought this was the messaging session.
6. **Layout issues** (earlier in thread) — Messaging tab not scrollable; Send button off-screen on intake form.
7. **Send button error** — “Failed to fetch” when submitting intake (CORS on `/api/webchat/message` from Webflow origin — fix attempted in API).
8. **Frustration:** fixes described by AI assistant do not match live behavior on Webflow after refresh/deploy.

---

## 3. Environment

| Item | Value |
|------|--------|
| Live website | `https://kids-0-to-18-integrative-pediatrics.webflow.io` |
| CRM / API / widget host | `https://app.kids0218.com` |
| GIGI embed | `<script src="https://app.kids0218.com/gigi-chatbot.js" data-api-url="https://app.kids0218.com">` |
| Standalone test page | `https://app.kids0218.com/webchat-test.html` |
| Patient portal (separate product) | `https://app.kids0218.com/portal` |
| Repo | `pediatric-practice-kid` (Next.js CRM) |
| OS | Windows 10, Chrome |

---

## 4. Architecture (three separate messaging surfaces)

```
┌─────────────────────────────────────────────────────────────────┐
│  M4 Patient Portal (/portal)                                     │
│  Auth: Phone → SMS OTP → DOB verify → 30-day session            │
│  Files: PortalAuth.tsx, /api/portal/auth                        │
│  SMS: Dev stub (real Twilio = M8, blocked)                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  M5 Web Chat Widget (standalone + GIGI Messaging tab)            │
│  Auth: Self-reported intake form (name, phone, reason, message)  │
│  NO SMS OTP, NO DOB per REQUIREMENTS.md / M5 plan                │
│  Files: public/webchat-core.js, public/webchat-widget.js         │
│         public/gigi-chatbot.js (embeds webchat-core)             │
│  API: GET/POST /api/webchat/init, /api/webchat/message           │
│  Session: localStorage key `kids018_webchat` + signed sessionToken│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  GIGI AI Tab (same widget, different feature)                    │
│  Auth: None (anonymous AI chatbot)                               │
│  Storage: localStorage key `gigi_chatbot` (sessionId, messages)│
│  API: POST /api/chatbot/message                                  │
│  NOT related to staff messaging inbox                            │
└─────────────────────────────────────────────────────────────────┘
```

**Critical confusion:** Reporter associates “SMS authentication that worked before” with **M4 Portal** (`/portal`), not M5 webchat. Git history shows webchat **never** had SMS OTP — only name/phone/reason intake since commit `3027374`.

---

## 5. Expected behavior (from project docs)

### REQUIREMENTS.md — Web Chat Widget
- Visitor provides **name + phone + reason** before first message
- Messages flow to CRM as WEB_CHAT channel
- Auto-match visitor to patient by phone

### MESSAGING_IMPLEMENTATION_PLAN.md — M5 acceptance
- New visitor prompted for name, phone, reason before first message
- Returning visitor resumes conversation (same browser / `kids018_webchat` localStorage)
- **M4 portal** (different): phone → SMS code → DOB

### What is NOT in scope (Phase 1)
- SMS OTP verification for anonymous website visitors (M8/Twilio + BAA)
- DOB verification on webchat widget (portal only)

---

## 6. Actual behavior (reporter experience)

| Scenario | Reporter sees |
|----------|----------------|
| Open GIGI → Messaging tab (normal browsing) | Empty chat + “Type a message…” — **no intake** |
| After previously sending messages in same browser | Chat history visible (“Hey yteam”), `sessionToken` polling in Network tab |
| Delete localStorage, refresh | `gigi_chatbot.sessionId` returns; user believes messaging session restored |
| Portal `/portal` | Phone → “Send verification code” — **works** (SMS stub) |
| One incognito test (screenshot) | `kids018_webchat` = null, intake form **visible** (“Before we connect you”) |
| `Kids018Webchat.VERSION` on live site | `undefined` (old webchat-core without VERSION export) |

**Interpretation:** Behavior is **inconsistent from reporter’s perspective** because (a) returning webchat sessions skip intake by design, (b) `gigi_chatbot` sessionId always recreates and is mistaken for messaging auth, (c) production JS may lag local repo, (d) intake form may have been clipped/hidden in earlier builds (layout bug).

---

## 7. Evidence collected

### 7.1 Screenshot A — Returning session (looks like “no auth”)
- Messaging tab active
- Messages: “Hey yteam” × 3
- Composer: “Type a message…” + Send
- Network: repeated `GET /api/webchat/message?sessionToken=MjFhN...` → 200
- **Conclusion:** Valid **returning** webchat session; intake correctly skipped for resume

### 7.2 Screenshot B — Fresh webchat storage (intake works)
- Incognito, iPhone XR emulation
- Console: `localStorage.getItem('kids018_webchat')` → **null**
- UI: **“Before we connect you”** + Name / Phone / Reason / Message + “Send message”
- Console: `Kids018Webchat.VERSION` → **undefined**
- **Conclusion:** Intake **can** render when `kids018_webchat` is empty; production code lacks VERSION string

### 7.3 Screenshot C — Portal SMS auth (working, different product)
- `/portal` shows “Sign in to message your care team” + phone field
- **Conclusion:** M4 portal auth intact; not the same code path as GIGI Messaging tab

### 7.4 Production vs local code (curl / git, June 21 2026)

| Check | Local git HEAD | Production `app.kids0218.com` |
|-------|----------------|-------------------------------------|
| `intakeCompleted` gate in `canResumeChat()` | **Yes** | **No** (older build) |
| `VERSION` in webchat-core | `2026.06.21-session-clarity` | **Missing** |
| `webchat-core.js` size | ~21,600 bytes | ~20,197 bytes |
| GIGI loads | `webchat-core.js?v=8` (local) | `webchat-core.js?v=6` (live at time of check) |
| GIGI styles | `gigi-chatbot-styles-v3` | `gigi-chatbot-styles-v3` |

**Conclusion:** Local fixes may **never have been deployed** or Webflow/browser cache serves stale scripts.

---

## 8. Root causes (ranked)

### RC-1: Expectation mismatch — Portal SMS auth ≠ Webchat intake (CONFIRMED)
- User expects phone → SMS → DOB on website widget
- Spec only requires name/phone/reason form for M5
- Portal SMS flow was working before GIGI integration because it is a **different URL and codebase**

### RC-2: Two localStorage keys conflated (CONFIRMED)
| Key | Purpose | Recreates on load? |
|-----|---------|-------------------|
| `gigi_chatbot` | GIGI AI tab | **Yes** — `sessionId` assigned in `mountWidget()` every load |
| `kids018_webchat` | Messaging tab | Only after intake submit or prior session |

Deleting wrong key or seeing `sessionId` return does **not** mean messaging auth was bypassed.

### RC-3: Returning session skips intake by design (CONFIRMED, often misreported as bug)
- After first successful POST, client stores `sessionToken`, `visitorName`, `visitorPhone`, `conversationId`
- `canResumeChat()` → true → chat composer, not intake
- Same browser / same incognito window after sending once = **not a new visitor**

### RC-4: Production deploy drift (CONFIRMED)
- Live server serves older `webchat-core.js` without `intakeCompleted`, without `VERSION`
- GIGI on production referenced `?v=6` while local repo had `?v=7`/`?v=8`
- Fixes in repo ≠ fixes on Webflow until `git pull`, `npm run build`, `pm2 restart`, hard refresh

### RC-5: Client session gate historically too weak (FIX ATTEMPTED locally)
- Original logic: `(conversationId \|\| sessionToken) && visitorName && visitorPhone` → chat
- Partial/corrupt localStorage could resume chat without valid server session
- Local fix added `intakeCompleted === true` + server validation on mount — **not verified on production**

### RC-6: Layout / scroll bugs hid intake form (FIX ATTEMPTED)
- Intake fields in footer clipped off-screen on standalone embed
- Send button in separate footer from scroll area on embedded GIGI tab
- User saw empty message area + chat composer → perceived as “authenticated empty chat”
- Fixes: unified scroll container, intake inside scroll — **not verified on production**

### RC-7: CORS blocked send from Webflow (FIX ATTEMPTED in API)
- `credentials: 'include'` on fetch without matching preflight `Allow-Credentials`
- Error: browser alert “Failed to fetch”
- Fixes in `lib/chatbot/cors.ts` and removed credentials from client — **requires API deploy**

### RC-8: GIGI Messaging tab singleton never remounts (LIKELY)
- `initMessagingTab()`: if `webchatCtrl` exists, only `startPolling()` + `refresh()` — **no re-wire of composer**
- Clearing `kids018_webchat` while widget stays open may not reset UI until full page reload
- File: `public/gigi-chatbot.js` lines 402–405

### RC-9: Server does not verify phone ownership for webchat (BY DESIGN, security gap)
- `sessionToken` = HMAC(conversationId + phone) issued on first POST with self-reported phone
- No SMS proof; anyone with token can poll messages
- Matches M5 spec but weaker than portal M4

---

## 9. Key code locations

| File | Responsibility |
|------|----------------|
| `public/webchat-core.js` | Intake vs chat logic, `canResumeChat()`, localStorage `kids018_webchat` |
| `public/webchat-widget.js` | Standalone loader → webchat-core |
| `public/gigi-chatbot.js` | GIGI widget; Messaging tab calls `Kids018Webchat.mountEmbedded()` |
| `public/webchat-test.html` | Test page loading widget from CRM server |
| `app/api/webchat/init/route.ts` | Widget config |
| `app/api/webchat/message/route.ts` | GET poll / POST send; issues `sessionToken` |
| `lib/messaging/webchatSession.ts` | Token sign/parse |
| `lib/chatbot/cors.ts` | CORS for webchat + chatbot from Webflow origin |
| `components/portal/PortalAuth.tsx` | **Separate** SMS + DOB flow |

### Current local `canResumeChat()` (webchat-core.js)
```javascript
function canResumeChat(state) {
  return state.intakeCompleted === true && hasVisitorIdentity(state) && hasSessionTokens(state);
}
```

### GIGI AI session always recreated (gigi-chatbot.js)
```javascript
if (!state.sessionId) state.sessionId = uuid();
saveState(); // STORAGE_KEY = 'gigi_chatbot'
```

### GIGI Messaging tab — no remount on second visit (gigi-chatbot.js)
```javascript
if (webchatCtrl) {
  webchatCtrl.startPolling();
  webchatCtrl.refresh();
  return; // does NOT re-run wireComposer / intake check
}
```

---

## 10. Reproduction steps (for next debugger)

### Test A — True first-time visitor
1. Chrome incognito
2. Open DevTools → Application → Local Storage → delete **`kids018_webchat`** AND **`gigi_chatbot`**
3. Navigate to Webflow site
4. Open GIGI → **Messaging** tab **without sending anything**
5. **Expected (M5):** “Before we connect you” intake form
6. **Reporter often sees:** “Type a message…” chat composer

### Test B — Returning visitor (not a bug if intake skipped)
1. Complete intake + send one message
2. Close widget, reopen Messaging tab
3. **Expected:** Chat composer with history; Network shows `?sessionToken=`

### Test C — Storage confusion
1. Run in console:
   ```javascript
   localStorage.getItem('kids018_webchat')
   localStorage.getItem('gigi_chatbot')
   Kids018Webchat?.VERSION
   ```
2. Document all three outputs

### Test D — Deploy verification
1. Network tab: which `webchat-core.js?v=` loads?
2. Response body must contain `intakeCompleted` and `2026.06.21-session-clarity` if latest deploy

### Test E — Portal comparison
1. Incognito → `/portal`
2. Confirm SMS code step still appears (proves M4 ≠ M5)

---

## 11. Fixes attempted (not accepted by reporter)

| # | Change | Files | Deployed? |
|---|--------|-------|-----------|
| 1 | Split GIGI scroll layout (gigi-scroll vs tab-panel) | gigi-chatbot.js | Unknown |
| 2 | CORS preflight credentials for /api/webchat/* | cors.ts, webchat routes | Unknown |
| 3 | Remove credentials from webchat fetch | webchat-core.js | Unknown |
| 4 | Intake inside scroll; hide footer during intake | webchat-core.js | Unknown |
| 5 | `intakeCompleted` gate + server session validation | webchat-core.js | **Not on production** |
| 6 | “New conversation” reset button | webchat-core.js | **Not on production** |
| 7 | Console log clarifying two storage keys | gigi-chatbot.js | Unknown |
| 8 | Cache bust v=6→v7→v8 | gigi, webchat-widget | **Production was v6** |

---

## 12. Recommended fix plan (for implementer — NOT DONE)

### Phase 1 — Deploy & verify (blocker)
1. Commit all changes in `public/webchat-core.js`, `public/gigi-chatbot.js`, `public/webchat-widget.js`, `lib/chatbot/cors.ts`, webchat API routes
2. Deploy to VPS: `git pull`, `npm run build`, `pm2 restart kids018-crm`
3. Confirm production `webchat-core.js` contains `intakeCompleted` and VERSION string
4. Hard refresh Webflow; confirm Network loads `?v=8`

### Phase 2 — GIGI remount bug (RC-8)
1. When `kids018_webchat` cleared or tab switched, call `webchatCtrl.destroy()` and remount OR expose `webchatCtrl.resetConversation()`
2. Do not reuse stale controller without re-running `wireComposer()`

### Phase 3 — UX clarity
1. Show visible banner: “Messaging as {name} · {phone}” when in chat mode
2. “Start new conversation” must clear **only** `kids018_webchat` and force intake UI
3. Document in widget: GIGI tab sessionId ≠ Messaging session

### Phase 4 — If SMS auth required on website (SCOPE CHANGE)
- Wire Messaging tab to M4 portal auth flow OR add SMS OTP to webchat
- Requires product decision; **not in M5 plan**; production SMS needs M8/Twilio + BAA
- Reporter must confirm: intake form OK vs mandatory SMS+DOB on Webflow

---

## 13. Open questions for product owner

1. Is **name + phone + reason intake** acceptable for website visitors, or is **SMS + DOB (portal-grade)** mandatory on Webflow?
2. Should returning visitors on same device skip intake (current M5 spec: yes)?
3. Has production VPS been deployed after the June 2026 widget changes? (Evidence suggests **no**.)
4. When reporter says “incognito still broken,” was Messaging tab opened **after** a message was already sent in that same incognito session?

---

## 14. Files to hand to next engineer

```
public/webchat-core.js          ← core bug surface
public/gigi-chatbot.js          ← GIGI embed + singleton issue
public/webchat-widget.js        ← standalone loader
app/api/webchat/message/route.ts
app/api/webchat/init/route.ts
lib/chatbot/cors.ts
lib/messaging/webchatSession.ts
components/portal/PortalAuth.tsx  ← reference for SMS auth (portal only)
MESSAGING_IMPLEMENTATION_PLAN.md  ← M4 vs M5 spec
REQUIREMENTS.md
```

---

## 15. Bottom line for Claude / next agent

**The reporter’s core complaint is valid from a UX perspective** even when some tests show intake working: the live Webflow experience is unreliable, confusing, and does not match their expectation of SMS-verified messaging. **Do not assume the bug is fixed** because local git has patches — production was confirmed serving older JS without `intakeCompleted`. **Do not conflate** `gigi_chatbot.sessionId` with messaging authentication. **Clarify with stakeholder** whether they need M5 intake-only or M4-style SMS+DOB on the public website before writing more client patches.

---

*End of bug report.*
