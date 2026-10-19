# Connecting Acácia (Vapi) to the CRM

Everything below is also shown, ready to copy, in **Settings → AI Voice Agent**. The values
there are generated from `lib/voice/contract.ts`, so they always match what the CRM expects.

## 1. Server URL and secret (required — the webhook fails closed)

| Vapi field | Value |
|---|---|
| Server URL | `https://<your-crm-domain>/api/webhooks/vapi` |
| Server secret | the same value as the `VAPI_WEBHOOK_SECRET` environment variable |

- Without `VAPI_WEBHOOK_SECRET` on the server, **every** Vapi request is refused (503). That is
  deliberate: before this change an unset secret meant anyone could write call logs or look up
  patients.
- Vapi may send the secret as `x-vapi-secret` or `Authorization: Bearer …`; both are accepted.
- Local development only: `VAPI_ALLOW_UNSIGNED=true` skips the check (ignored in production).
- Refused deliveries appear in Settings → AI Voice Agent with a plain-language cause.

## 2. Tools

Replace the assistant's tools with the JSON from **Settings → AI Voice Agent → Connect Vapi →
Tools**. The ten tools are:

| Tool | What it does | Needs identity? |
|---|---|---|
| `lookup_patient` | Confirms identity; returns first name + next appointment only | full name + DOB |
| `check_availability` | Free slots for a date (and the next day with slots) | — |
| `book_appointment` | Books routine types for existing patients | full name + DOB |
| `reschedule_appointment` | Moves an appointment | full name + DOB |
| `cancel_appointment` | Cancels; flags late cancellations | full name + DOB |
| `create_callback_request` | New patients, urgent cases, anything else → Callbacks queue | — |
| `transfer_to_human` | Logs context; says whether to transfer (open) or take a callback (closed) | — |
| `verify_insurance` | Answers from Settings → Insurers | — |
| `get_opening_hours` | Open now? Weekly hours, next closures | — |
| `answer_question` | Answers only from the approved Knowledge Base | — |

**Breaking change from the old (pediatric) tools:** `lookup_patient` no longer accepts a first
name alone, and `book_appointment` / `cancel_appointment` now require `date_of_birth`. Until the
assistant is updated, those calls answer "I need the date of birth…" — they fail safe, but the
agent can't book. Update the tools when you deploy.

Old tools `submit_refill_request` and `send_intake_forms` are still answered safely (a refusal,
and a callback request respectively) in case an old configuration calls them.

## 3. Structured output (analysis plan)

Paste the **Structured output schema** from the same screen into the assistant's analysis plan.
Only `call_outcome` is required. The CRM files the outcome in this order: what the tools actually
did during the call → structured output → keyword fallback. The model cannot mark a call as
booked unless a booking tool really booked.

## 4. Prompt

Paste your system prompt into **Settings → AI Voice Agent → Check the agent's prompt**. It must
contain: AI disclosure, recording disclosure, identity verification (name + DOB), no clinical
advice, an urgent-symptom path (112 / urgent callback) and the new-patient rule.

A starting point that passes the check — **review it against the Guião Acácia before use**:

```text
És a Acácia, a assistente virtual (inteligência artificial) da Clínica Dentária Nunes Monteiro,
na Malveira. Falas português de Portugal; se a pessoa falar inglês ou espanhol, responde nessa língua.

Abertura: "Clínica Dentária Nunes Monteiro, fala a Acácia, assistente virtual. Esta chamada pode
ser gravada para fins de qualidade. Em que posso ajudar?"

Regras:
- Antes de falar de qualquer consulta, pede o nome completo e a data de nascimento do paciente e
  usa lookup_patient. Sem confirmação, não partilhes nenhuma informação.
- Novos pacientes não são marcados diretamente: recolhe o nome e o motivo e usa
  create_callback_request com is_new_patient=true. A equipa confirma a disponibilidade e liga de volta.
- Não dás conselhos clínicos nem diagnósticos. Em caso de dor forte, inchaço, dente partido,
  traumatismo ou hemorragia, usa create_callback_request com urgency="urgent". Se houver dificuldade
  em respirar, inchaço que se espalha ou hemorragia que não para, diz para ligar 112.
- Preços, seguros, pagamentos e políticas: usa answer_question ou verify_insurance. Nunca inventes.
- Horários: usa check_availability e oferece no máximo três opções. Confirma data e hora antes de
  book_appointment.
- Se pedirem para falar com alguém, usa transfer_to_human e segue a indicação (transferir ou
  registar um pedido de chamada, se a clínica estiver fechada).
- Frases curtas, tom calmo e simpático.
```

## 5. Kill switch

Settings → AI Voice Agent → **Pause tools** stops patient look-ups and all calendar changes
immediately (no redeploy). Callbacks, transfers and opening hours keep working.
