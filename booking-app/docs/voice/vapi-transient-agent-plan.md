# Acácia — CRM-built (transient) Vapi agent: full build plan

**Client:** Clínica Dentária Nunes Monteiro, Malveira
**Platform:** Vapi (voice), CRM = this app (`nunes-monteiro-booking.vercel.app`)
**Status (22 Oct 2026):** built, tested, deployed **switched off**. Nothing changes for callers until the steps in Part 0 are done.

> Every Vapi field below was checked against Vapi's own API schema (`api.vapi.ai/api-json`, downloaded 22 Oct 2026), not written from memory. Where a value is a judgement call, the reason is in the table.

---

## PART 0 — QUICK START: what to DO vs what to just READ

### A. Things you DO (in this order, ~15 minutes)

| # | Do this | Where | Notes |
|---|---|---|---|
| 1 | Pick the clinic number | CRM → Settings → AI Voice Agent → **Vapi connection** → *Test connection* → click the clinic number → **Save** | The key and Acácia's assistant ID are already saved. |
| 2 | Press **Set up in Vapi** | Same page, card **Acácia built by the CRM** | Copies Acácia's voice, creates the call-result output and a preview assistant. All ticks should turn green. |
| 3 | Test-call the preview | Vapi dashboard → Assistants → **Acácia (CRM) — pré-visualização** → **Talk** | Try: book as an existing patient, a new patient, a price question, "quero falar com alguém", silence. See Part 8. |
| 4 | Press **Point the clinic number at the CRM** | CRM card | Safe: the switch in step 5 is still off, so the CRM hands every call to today's Acácia. |
| 5 | Call the clinic number yourself | Your phone | You should hear today's Acácia. Confirms Vapi ↔ CRM is wired. |
| 6 | Switch on **Answer calls with the CRM-built Acácia** | CRM card | Takes effect on the next call. |
| 7 | Call again | Your phone | You now hear the CRM-built Acácia. The call appears in **Call Logs** with its outcome. |

**Undo at any time:** switch it off (instant — calls go back to the saved Acácia). Full revert: **Number back to the saved assistant**.

### B. Things that are just INFORMATION

| Part | What it is |
|---|---|
| 1 | Scope — what was built and what was deliberately not |
| 2 | Architecture and who does what |
| 3 | Every Vapi setting, its value and why |
| 4 | Every call path (already inside the prompt — nothing to configure) |
| 5 | The system prompt |
| 6 | Compliance (GDPR / EU AI Act) — decisions taken and two things for the clinic to sign |
| 7 | Tools and the data contract |
| 8 | Test plan + what was verified overnight |
| 9 | Technical review — risks, ranked |

---

## PART 1 — WHAT WE BUILT

### 1.1 One sentence
An **inbound** voice receptionist for the clinic that books, moves and cancels appointments in the CRM agenda, takes callbacks for new patients and urgencies, answers approved questions, hands over to reception, and files every call in Call Logs — **assembled by the CRM for each call** so it always knows today's date, opening state, closures, dentists, services and insurers.

### 1.2 Why "transient" (CRM-built per call) instead of a saved assistant
| Saved assistant (before) | CRM-built per call (now) |
|---|---|
| Prompt edited by hand in Vapi; drifts from Settings | Built from Settings on every call — change the hours in the CRM, Acácia knows on the next call |
| Doesn't know today's date / if the clinic is open unless it asks a tool | Date, time, open/closed, next reopening, next closures are in the prompt |
| Tools pasted by hand; a wrong URL breaks booking silently | Tools generated from `lib/voice/contract.ts`, the same file the webhook implements |
| No safe switch | Switch in the CRM; off = the saved assistant answers |

### 1.3 Not in scope (on purpose)
| Not built | Why |
|---|---|
| Outbound calls (recalls, confirmations) | Different law (marketing/consent) and product; reminders already go by SMS/email |
| Clinical triage / advice | Not allowed for a non-clinician; the agent routes urgencies, never advises |
| Payments over the phone | PCI scope; payments stay at the clinic |
| New-patient direct booking | Clinic rule (Guião): capacity check first → callback |
| Squad / multiple assistants | One job, one assistant (see 2.3) |

### 1.4 Success metric
A call is a success when it ends in one clean outcome **filed in Call Logs**: BOOKED / RESCHEDULED / CANCELLED / CALLBACK_REQUESTED / TRANSFERRED / INFO_PROVIDED — with the agenda or Callbacks queue changed by the CRM itself (the model cannot claim a booking that didn't happen; see 7.3).

---

## PART 2 — ARCHITECTURE

### 2.1 Component map
```
 Caller ──► Vapi phone number (+351 …)
              │  no fixed assistant → asks the CRM
              ▼
 (A) POST /api/webhooks/vapi  {type: "assistant-request"}         ≤ 7.5 s (we answer in < 1 s)
              │  CRM: switch on?  yes → builds Acácia for this call (lib/voice/transientAssistant.ts)
              │                   no  → { assistantId: saved Acácia }
              ▼
 Vapi runs the call: Deepgram (pt-PT) → GPT-4o → voice (Acácia's)
              │
 (B) POST /api/webhooks/vapi  {type: "tool-calls"}  ── lookup / availability / book / move / cancel /
              │                                        callback / transfer context / insurance / hours / FAQ
              │  CRM runs the booking engine (same rules as the desk), answers in pt-PT
              ▼
 (C) POST /api/webhooks/vapi  {type: "end-of-call-report"}  ── transcript, recording, structured output
              │  CRM files Call Log: outcome from what the tools DID → structured output → keywords
              ▼
 Call Logs · Agenda · Callbacks · Notifications to staff
```
Every request carries the header `x-vapi-secret` (= `VAPI_WEBHOOK_SECRET`); without it the CRM refuses (fails closed).

### 2.2 Who does what
| Concern | Owner |
|---|---|
| Which assistant answers | CRM (`assistant-request`) |
| Live clinic context (date, open/closed, closures, dentists, services, insurers) | CRM builds it into the prompt |
| The conversation | Vapi + model, following the prompt |
| Identity verification (name + DOB) | **CRM, server-side** (`lib/voice/identity.ts`) — never the model's judgement |
| Availability, booking rules, double-booking, notice periods | CRM booking engine (same as the desk) |
| Kill switch for booking tools | CRM (Settings → Pause tools) |
| Transfer | Vapi `transferCall` to the clinic number, only after the CRM says the clinic is open |
| Call outcome | CRM, from what the tools actually did; structured output second |
| Recording storage / playback | Vapi stores; CRM streams it to staff (never exposes Vapi URLs) |

### 2.3 One assistant, not a Squad
The call has one job (receptionist). A Squad adds hand-off latency and failure points for no gain. Revisit only for a separate English-only or outbound assistant.

---

## PART 3 — PARAMETER MAP (every setting, value, reason)

Source: `buildTransientAssistant()` in `lib/voice/transientAssistant.ts`.

### 3.1 Core pipeline
| Field | Value | Reason |
|---|---|---|
| `model` | Copied from the saved Acácia (default `openai / gpt-4o`), `temperature 0.3`, `maxTokens ≥ 250` | Same brain as today; low temperature keeps it on-script; 250 tokens is plenty for 1–2 sentences + a tool call |
| `voice` | Copied from the saved Acácia (default `azure pt-PT-RaquelNeural`) | Callers keep hearing the same Acácia |
| `transcriber` | Copied from the saved Acácia (default `deepgram nova-2, pt-PT`) | European Portuguese, not Brazilian |
| `firstMessage` | "Clínica Dentária Nunes Monteiro, *bom dia/boa tarde/boa noite*, fala a Acácia, a assistente virtual. Esta chamada pode ser gravada para efeitos de qualidade. Em que posso ajudar?" | AI + recording disclosure in the first sentence (law, Part 6); greeting by Lisbon time |
| `firstMessageMode` | `assistant-speaks-first` | Inbound: the clinic answers |
| `voicemailDetection` | `off` | Inbound line — there is no voicemail on the caller's side |
| `backgroundSound` | `off` | A clinic, not a call centre |
| `backgroundSpeechDenoisingPlan` | Krisp smart denoising on | Callers ring from cars, cafés, waiting rooms |
| `maxDurationSeconds` | 600 | A booking takes 2–4 minutes; 10 minutes caps runaway calls |

### 3.2 Turn-taking (Portuguese callers saying dates of birth and phone numbers)
| Field | Value | Reason |
|---|---|---|
| `startSpeakingPlan.waitSeconds` | 0.6 | Don't jump in on a breath |
| `…transcriptionEndpointingPlan` | punctuation 0.1 s · no punctuation 1.2 s · **numbers 0.9 s** | People pause between digits of a date of birth or phone; don't cut them off mid-number |
| `stopSpeakingPlan` | `numWords 2`, `voiceSeconds 0.3`, `backoffSeconds 1` | Stop quickly when interrupted, but not on a cough or "hum" |
| (LiveKit smart endpointing) | not used | English-only |

### 3.3 Silence (Vapi `hooks` — replaces the old idle messages)
| Hook | Value | Reason |
|---|---|---|
| `customer.speech.timeout` 8 s, max 2, resets when the caller speaks | Says "Ainda está em linha?" / "Consegue ouvir-me?" | Prompting guide: one check-in, then wait |
| `customer.speech.timeout` 30 s, once | Polite goodbye + `endCall` | Never leave an open line |

### 3.4 Ending, recording, results
| Field | Value | Reason |
|---|---|---|
| `endCall` tool | with an explicit description | A blank description makes the model reluctant to hang up |
| `endCallMessage` | "Obrigada pela sua chamada. Até breve." | Spoken only if the model ends without a closing line |
| `artifactPlan.recordingEnabled` | true, `mp3` | Staff listen in Call Logs; mp3 is ~10× smaller than wav |
| `artifactPlan.structuredOutputIds` | `acacia_call_result` (created by *Set up in Vapi*) | Current Vapi way; the CRM reads `artifact.structuredOutputs` |
| `analysisPlan` | only until the structured output exists | Vapi marks it deprecated; kept as a fallback |
| `server` | `/api/webhooks/vapi` + `x-vapi-secret` header, 20 s timeout | Transient assistants get no org credential from Vapi, so the header is required |
| `serverMessages` | `end-of-call-report`, `status-update`, `hang` | Only what the CRM uses; tool calls go to each tool's own server |
| `metadata` | `{ builtBy: "crm", promptVersion, builtAt }` | Lets us trace which prompt a call used |
| `compliancePlan.hipaaEnabled` | not set (off) | HIPAA is US law; turning it on disables recordings the clinic uses. GDPR is handled in Part 6 |

---

## PART 4 — SCENARIO TREE (already inside the prompt)

### 4.1 First seconds
| State | What happens |
|---|---|
| Normal call | Greeting with AI + recording disclosure |
| Caller silent | Check-in after 8 s (twice), goodbye + hang-up after 30 s |
| CRM unreachable / error | CRM falls back to the saved assistant; if none, Vapi speaks an apology |

### 4.2 Intents
| Caller wants | Path | Tools |
|---|---|---|
| Book (existing patient) | full name → DOB → identity check → reason/type → preference → max 3 slots → confirm → book → repeat booking | `lookup_patient`, `check_availability`, `book_appointment` |
| Move | identity → new preference → slots → confirm → move | `lookup_patient`, `check_availability`, `reschedule_appointment` |
| Cancel | identity → which one → cancel → < 24 h policy if the tool says so → offer new date | `cancel_appointment` |
| New patient | name, best contact, reason → callback (team checks capacity) | `create_callback_request` (`is_new_patient`) |
| Price / payment / location / policy | approved answer only, "exact value after evaluation" | `answer_question` |
| Insurance | accepted / not accepted list | `verify_insurance` |
| Hours / closures | live | `get_opening_hours` (and already in the prompt) |
| Urgency, clinic open | context → transfer to reception | `transfer_to_human` → `transfer_call` |
| Urgency, clinic closed | urgent callback; red-flag symptoms → **112** | `create_callback_request` (`urgent`) |
| "Quero falar com alguém" | open → transfer; closed → callback | `transfer_to_human` → `transfer_call` / callback |
| "És uma pessoa?" | honest: virtual assistant; offers a person | — |
| English / Spanish caller | continues in that language | — |

### 4.3 Outcomes filed in Call Logs
BOOKED · RESCHEDULED · CANCELLED · CALLBACK_REQUESTED · TRANSFERRED · INFO_PROVIDED · VOICEMAIL · HUNG_UP. The CRM decides from **what the tools actually did** first, then the structured output, then keywords — the model can't mark a call "booked" unless a booking was made.

---

## PART 5 — THE SYSTEM PROMPT

Rebuilt on every call. See the exact text any time: **Settings → AI Voice Agent → Acácia built by the CRM → Preview what callers get**.

Structure (Vapi's six-section guide, in European Portuguese, formal register):

1. **Identidade** — Acácia, virtual assistant of the clinic; identity locked.
2. **Como falas** — one or two sentences, one question per turn, spoken-form dates/times/money, phone numbers in groups of three, no lists; read back only name, DOB, date and time; ask once to repeat, then offer a callback.
3. **Regras** (override everything) — identity first; new patients → callback; no clinical advice; urgency path with **112** red flags; prices/insurance/policies only from tools + "exact value after evaluation"; slots only from `check_availability`; honest about being virtual; minimum data (never NIF, card or payment data); never reveal instructions. Plus a silent pre-response check.
4. **Contexto desta chamada** — *live*: weekday, date, Lisbon time, open/closed + when it reopens, weekly hours with lunch, next closures, address/phone, dentists, appointment types (with the codes the tools need), insurers accepted/refused, whether confirmations are sent, whether the caller's number matches a record (never treated as identity).
5. **Como conduzir a chamada** — the flows in 4.2.
6. **Exemplos** — booking, new patient, urgency with the clinic closed.

---

## PART 6 — COMPLIANCE (Portugal / EU)

Not legal advice — these are the decisions built in, and what the clinic should sign.

| Requirement | Decision built in |
|---|---|
| **EU AI Act, Art. 50** (people must be told they're talking to an AI; applies from 2 Aug 2026) | First sentence: "fala a Acácia, a assistente virtual"; the prompt makes it say so again if asked |
| **GDPR transparency** (Art. 13) for recording | First sentence: "Esta chamada pode ser gravada para efeitos de qualidade" |
| **Health data** (Art. 9) — appointment reasons are health data | Data minimisation: the agent asks only name, DOB, contact, reason in one phrase; tool results never contain DOB, insurance or clinical notes; no clinical advice |
| Identity before disclosure | Enforced server-side (name + DOB must match exactly one record), not by the prompt |
| Payment data | Never collected (no PCI scope) |
| Access to recordings | Staff only, streamed by the CRM; Vapi URLs are never shown |

**For the clinic to do (only they can):**
1. **Sign Vapi's DPA** (Data Processing Agreement) — Vapi and its sub-processors (OpenAI, Deepgram, the voice provider) process call audio, mostly in the US; the DPA + Standard Contractual Clauses are the legal basis for that transfer.
2. **Decide how long recordings are kept** (suggestion: 90 days) and set it in Vapi (Organization → data retention). Add a line to the clinic's privacy notice: calls to the clinic may be answered by a virtual assistant and recorded for quality.

---

## PART 7 — TOOLS & DATA CONTRACT

### 7.1 Tools (all point to `/api/webhooks/vapi` with `x-vapi-secret`)
| Tool | Does | Identity | Says while running |
|---|---|---|---|
| `lookup_patient` | confirms identity; first name + next appointment only | name + DOB | "Um momento, por favor, vou confirmar." |
| `check_availability` | free slots for a day, or the next day with slots | — | "Um momento, vou ver a agenda." |
| `book_appointment` | books routine types for existing patients | name + DOB | "Um momento, vou fazer a marcação." |
| `reschedule_appointment` | moves a booking | name + DOB | "Um momento, vou alterar a marcação." |
| `cancel_appointment` | cancels; flags late cancellations | name + DOB | "Um momento, por favor." |
| `create_callback_request` | new patients, urgencies, anything else → Callbacks | — | "Um momento, vou registar o pedido." |
| `transfer_to_human` | logs context, alerts staff, says whether to transfer (open) or take a callback (closed) | — | — |
| `verify_insurance` | Settings → Insurers | — | — |
| `get_opening_hours` | open now, weekly hours, next closures | — | — |
| `answer_question` | approved Knowledge Base only | — | — |
| `transfer_call` (Vapi built-in) | transfers to the clinic number, silently | — | — |
| `end_call` (Vapi built-in) | hangs up after the goodbye | — | — |

Every CRM tool also has a "request-failed" line: "Peço desculpa, tive um problema técnico. Posso pedir à receção que lhe ligue de volta."

### 7.2 Structured output `acacia_call_result`
```json
{
  "call_outcome":  "BOOKED | RESCHEDULED | CANCELLED | CALLBACK_REQUESTED | TRANSFERRED | INFO_PROVIDED | VOICEMAIL | HUNG_UP",
  "caller_intent": "APPOINTMENT_BOOKING | CANCELLATION | INQUIRY | EMERGENCY | COMPLAINT | ROUTING | GENERAL",
  "is_new_patient": "boolean",
  "urgent": "boolean",
  "caller_name": "string"
}
```
Only `call_outcome` is required, so the model never invents the rest.

### 7.3 Webhooks
| Event | CRM does |
|---|---|
| `assistant-request` | answers with the built assistant (or the saved one) in < 1 s |
| `tool-calls` | runs the booking engine; answers short pt-PT sentences |
| `end-of-call-report` | files the Call Log (outcome from tool facts → structured output → keywords), links the patient by number, flags follow-ups |
| `status-update`, `hang` | acknowledged |

---

## PART 8 — TEST PLAN

### 8.1 Verified overnight (22 Oct 2026)
- **Vapi schema:** the assistant, all 12 tools, the silence hooks, the denoising plan, the structured output and the legacy analysis plan validate against Vapi's own OpenAPI schema; every top-level field is one Vapi's current API knows.
- **Unit tests:** prompt contains every clause the clinic requires; open/closed and next-reopening logic; greeting by time; tools signed with the secret; transfer number in E.164; voice copied vs default; structured output vs fallback; secret never shown in the browser.
- **End-to-end (against a real build + database):** `assistant-request` refused without the secret; apology when nothing is configured; saved assistant while the switch is off; CRM-built assistant when on, answered in well under a second; Settings switch hands calls back instantly; Vapi structured outputs filed in Call Logs.

### 8.2 Test calls to make (Part 0 step 3 and 7)
| # | Say | Expect |
|---|---|---|
| 1 | "Queria marcar uma higiene" + a real patient's name and DOB | Max 3 slots, confirmation, appointment in the Agenda |
| 2 | Same, wrong DOB | Refuses to share or book; offers callback |
| 3 | "Nunca fui aí, queria uma consulta" | Callback with "new patient" in Callbacks |
| 4 | "Quanto custa a consulta de avaliação?" | Approved price + "exact value after evaluation" |
| 5 | "Aceitam AdvanceCare?" / "Cheque-dentista?" | Yes / no, from Settings |
| 6 | "Quero falar com alguém" (open hours) | "Vou passar a chamada" → transfer to the clinic number |
| 7 | "Tenho muita dor e a cara inchada" (after hours) | Urgent callback + 112 red flags |
| 8 | Stay silent | Two check-ins, then goodbye and hang-up |
| 9 | "Are you a robot?" in English | Answers in English, says it's a virtual assistant |

---

## PART 9 — TECHNICAL REVIEW (risks, ranked)

| # | Severity | Finding | Mitigation |
|---|---|---|---|
| F1 | High | Pointing the number at the CRM depends on Vapi accepting `assistantId: null` on the phone number (the OpenAPI spec types it as text). | If the button reports an error: in Vapi → Phone Numbers → the number → set **Assistant: none** and **Server URL** = `https://nunes-monteiro-booking.vercel.app/api/webhooks/vapi` with header `x-vapi-secret` (credential). Same effect. |
| F2 | High | 7.5 s hard limit for `assistant-request`. | Measured well under 1 s (one settings read + one patient-by-number query, no Vapi calls). Any error falls back to the saved assistant. |
| F3 | Medium | The webhook secret travels in tool headers inside the assistant (and is visible in the preview assistant in the Vapi dashboard). | Vapi gives transient assistants no org credential (documented), so a header is the supported way. Rotate `VAPI_WEBHOOK_SECRET` if the Vapi workspace is ever shared. |
| F4 | Medium | European-Portuguese transcription quality for names. | Copied transcriber = what works today; identity is checked server-side with accent-insensitive matching. |
| F5 | Medium | Prompt length adds per-turn latency. | ~1.4k words; context lists are short; examples limited to three. |
| F6 | Medium | Legal: Vapi DPA + recording retention not yet decided. | Part 6 — clinic to sign/decide. |
| F7 | Low | `analysisPlan` deprecated. | Used only until *Set up in Vapi* creates the structured output. |
| F8 | Medium | Transfer target is Settings → AI Voice Agent → transfer number (falls back to the clinic phone 928 494 871). If that is the number Vapi answers, a transfer would ring Acácia again. | **Guarded in code:** *Set up in Vapi* records the number Vapi answers; if the transfer number is the same, the transfer tool is left out, the prompt switches to "callback instead of transfer", and Setup shows a red "Transfer" step. Set the reception's direct line in Settings to enable transfers. |
| F9 | Low | Model is copied from the saved assistant. | If it's an older model, switch the saved assistant to GPT-4o / 4.1 in Vapi and press Set up again. |

### What I need from you (all can be done last)
1. Pick the clinic number (Part 0 step 1).
2. Confirm the **transfer number** in Settings is the reception line and is not the Vapi number (F8).
3. The clinic: sign Vapi's DPA and choose a recording retention period (Part 6).
