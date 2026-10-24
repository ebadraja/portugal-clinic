/**
 * Acácia as a CRM-built ("transient") Vapi assistant.
 *
 * On every inbound call Vapi asks the CRM which assistant should answer (`assistant-request`,
 * answered within 7.5 s). The CRM replies with a complete assistant built for that moment: the
 * prompt carries today's date and time, whether the clinic is open, the next closures, the dentists,
 * the services and the insurers straight from Settings, and the tools point back at the CRM.
 * Nothing about Acácia has to be maintained by hand in the Vapi dashboard any more.
 *
 * Plan and every setting's reason: docs/voice/vapi-transient-agent-plan.md.
 * Pure: no database access. Everything it needs is passed in, so it is unit-tested directly.
 */
import type { ClinicSettings } from '@/lib/clinic/settings'
import { activeProviders, closureOn, hoursFor } from '@/lib/clinic/settings'
import { addDays, formatDateLong, formatDateStringLong, formatTime, todayInZone, utcToZoned } from '@/lib/clinic/time'
import { toE164 } from '@/lib/clinic/phone'
import { STRUCTURED_OUTPUT_SCHEMA, TOOL_DEFINITIONS } from '@/lib/voice/contract'
import { DEFAULT_FIRST_MESSAGE_TEMPLATE, DEFAULT_PROMPT_TEMPLATE, renderTemplate, type PromptVariableName } from '@/lib/voice/promptTemplate'
import { hoursSummary, isOpenNow } from '@/lib/voice/tools'
import type { AssistantSnapshot } from '@/lib/voice/vapiApi'

/** Bump when the prompt or settings change in a way worth seeing in call metadata. */
export const PROMPT_VERSION = '2026-10-25.1'

export { STRUCTURED_OUTPUT_NAME } from '@/lib/voice/contract'

export type BuildInput = {
  settings: ClinicSettings
  now: Date
  /** CRM base URL, e.g. https://nunes-monteiro-booking.vercel.app */
  baseUrl: string
  /** VAPI_WEBHOOK_SECRET — sent as x-vapi-secret on every request Vapi makes to the CRM. */
  webhookSecret: string
  /** Voice / transcriber / model copied from the saved assistant. */
  snapshot?: AssistantSnapshot | null
  /** Vapi structured-output id (Settings → Vapi → Set up). Without it the legacy analysis plan is used. */
  structuredOutputId?: string | null
  /** True when the caller's number matches exactly one patient record (identity still required). */
  callerKnown?: boolean
}

/** The transfer target, or null when there is none or it is the number Vapi itself answers (a loop). */
export function transferTarget(settings: ClinicSettings, snapshot?: AssistantSnapshot | null): string | null {
  const n = toE164(settings.voiceAgent.transferPhone || settings.practice.phone)
  if (!n) return null
  if (snapshot?.phoneNumber && toE164(snapshot.phoneNumber) === n) return null
  return n
}

// ── Defaults used only when the saved assistant could not be read ──
const DEFAULT_VOICE = { provider: 'azure', voiceId: 'pt-PT-RaquelNeural' }
const DEFAULT_TRANSCRIBER = { provider: 'deepgram', model: 'nova-2', language: 'pt-PT' }
const DEFAULT_MODEL = { provider: 'openai', model: 'gpt-4o', temperature: 0.3, maxTokens: 300 }
/** Callers speak Portuguese; the prompt also lets Acácia continue in English or Spanish. */
const CALLER_LANGUAGES = ['pt', 'en', 'es']

/**
 * Whether a copied voice can speak European Portuguese. Vapi's own voices (Elliot, …) are English-only
 * and turn "Acácia" into "Cássia"; Azure voices must be a pt-* voice. Other providers are multilingual.
 */
export function isPortugueseVoice(voice: Record<string, unknown> | null | undefined): boolean {
  if (!voice || !Object.keys(voice).length) return false
  const provider = String(voice.provider ?? '')
  if (provider === 'vapi') return false
  if (provider === 'azure') return /^pt-/i.test(String(voice.voiceId ?? ''))
  return true
}

/**
 * The copied transcriber, made to hear Portuguese. A transcriber locked to English (the first test
 * call had Soniox on `languages: ['en']`, strict) would turn every Portuguese caller into English noise.
 */
export function portugueseTranscriber(transcriber: Record<string, unknown> | null | undefined, vocabulary: string[]): Record<string, unknown> {
  const t = transcriber && Object.keys(transcriber).length ? transcriber : null
  if (t?.provider === 'soniox') {
    return { ...t, language: 'pt', languages: CALLER_LANGUAGES, customVocabulary: vocabulary }
  }
  if (t?.provider === 'deepgram') {
    const lang = String(t.language ?? '')
    return { ...t, language: lang.startsWith('pt') || lang === 'multi' ? lang : 'pt-PT' }
  }
  return DEFAULT_TRANSCRIBER
}

/** Names the transcriber should know: the agent, the clinic, the town and the dentists. */
function transcriberVocabulary(settings: ClinicSettings): string[] {
  const words = [settings.voiceAgent.name || 'Acácia', settings.practice.name, 'Malveira', ...activeProviders(settings).map((p) => p.name)]
  return [...new Set(words.filter(Boolean))].slice(0, 30)
}

/** "bom dia" until 13:00, "boa tarde" until 20:00, then "boa noite" (clinic time). */
export function greetingFor(now: Date, timeZone: string): 'bom dia' | 'boa tarde' | 'boa noite' {
  const m = utcToZoned(now, timeZone).minutes
  return m < 13 * 60 ? 'bom dia' : m < 20 * 60 ? 'boa tarde' : 'boa noite'
}

/** When the clinic next opens, in words ("hoje às 14:00", "segunda-feira, 26 de outubro, às 09:30"). */
export function nextOpening(settings: ClinicSettings, now: Date): string | null {
  const z = utcToZoned(now, settings.timezone)
  for (let i = 0; i <= 14; i++) {
    const d = addDays(z.date, i)
    if (closureOn(d, settings.holidays)) continue
    const h = hoursFor(d, settings.businessHours)
    if (!h) continue
    const starts = [h.open, ...(settings.lunchBreak.enabled ? [settings.lunchBreak.end] : [])]
    for (const t of starts) {
      const [hh, mm] = t.split(':').map(Number)
      const minutes = hh * 60 + mm
      if (i > 0 || minutes > z.minutes) {
        return i === 0 ? `hoje às ${t}` : i === 1 ? `amanhã às ${t}` : `${formatDateStringLong(d, settings.locale)} às ${t}`
      }
    }
  }
  return null
}

function upcomingClosures(settings: ClinicSettings, now: Date): string[] {
  const today = todayInZone(settings.timezone, now)
  const out: string[] = []
  for (let i = 0; i <= 45 && out.length < 4; i++) {
    const d = addDays(today, i)
    const name = closureOn(d, settings.holidays)
    if (name && hoursFor(d, settings.businessHours)) out.push(`${formatDateStringLong(d, settings.locale)} (${name})`)
  }
  return out
}

/** The live facts an edited prompt can use ({{name}} in lib/voice/promptTemplate.ts). */
export function promptVariables(input: BuildInput): Record<PromptVariableName, string> {
  const { settings: s, now } = input
  const open = isOpenNow(s, now)
  const reopen = open ? null : nextOpening(s, now)
  const closures = upcomingClosures(s, now)
  const dentists = activeProviders(s).map((p) => `${p.name}${p.title ? ` (${p.title})` : ''}`)
  const types = s.appointmentTypes.filter((t) => t.active).map((t) => `${t.type} = ${t.label} (${t.durationMinutes} minutos)`)
  const accepted = s.insurers.accepted
  const notAccepted = s.insurers.notAccepted
  const canTransfer = !!transferTarget(s, input.snapshot)
  return {
    agent_name: s.voiceAgent.name || 'Acácia',
    clinic_name: s.practice.name,
    greeting: greetingFor(now, s.timezone),
    today: formatDateLong(now, s.timezone, s.locale),
    time_now: formatTime(now, s.timezone, s.locale),
    open_status: open ? 'aberta neste momento' : `fechada neste momento${reopen ? `; reabre ${reopen}` : ''}`,
    opening_hours: hoursSummary(s),
    upcoming_closures: closures.length ? closures.join('; ') : 'nenhum nas próximas semanas',
    address: s.practice.address,
    clinic_phone: s.practice.phone,
    dentists: dentists.length ? dentists.join('; ') : 'consulte a receção',
    appointment_types: types.join('; '),
    insurers: `${accepted.length ? accepted.join(', ') : 'nenhum registado'}${notAccepted.length ? `. Não aceites: ${notAccepted.join(', ')}` : ''}`,
    confirmation_rule: s.flags.reminders
      ? 'O paciente recebe uma mensagem de confirmação e um lembrete antes da consulta.'
      : 'Não prometas mensagens de confirmação: a clínica ainda não as envia por este sistema.',
    caller_record: input.callerKnown
      ? 'O número de quem liga está associado a uma ficha de paciente, mas isso não confirma quem fala: pede sempre o nome completo e a data de nascimento.'
      : 'O número de quem liga não está associado a nenhuma ficha (pode ser um novo paciente, ou ligar de outro telefone).',
    urgent_action: canTransfer
      ? 'se a clínica estiver aberta, usas transfer_to_human e transferes a chamada; se estiver fechada,'
      : 'em qualquer caso',
    transfer_rule: canTransfer
      ? 'Falar com alguém, ou algo que não consegues resolver: usa transfer_to_human com o motivo. Se a resposta disser para transferir, diz apenas "Vou passar a chamada, um momento." e usa transfer_call. Se a clínica estiver fechada, oferece um pedido de chamada.'
      : 'Falar com alguém, ou algo que não consegues resolver: não é possível transferir chamadas. Usa create_callback_request com o motivo e diz que a equipa liga de volta (com urgency "urgent" se for urgente).',
  }
}

/**
 * The system prompt, rebuilt for every call: the clinic's edited template (Settings → AI Voice Agent),
 * or the built-in one, with the live facts filled in. Spoken pt-PT; no tags reach Vapi.
 */
export function buildSystemPrompt(input: BuildInput): string {
  return renderTemplate(input.settings.voiceAgent.promptTemplate ?? DEFAULT_PROMPT_TEMPLATE, promptVariables(input))
}

export function buildFirstMessage(settings: ClinicSettings, now: Date): string {
  return renderTemplate(settings.voiceAgent.firstMessageTemplate ?? DEFAULT_FIRST_MESSAGE_TEMPLATE, promptVariables({ settings, now, baseUrl: '', webhookSecret: '' }))
}

type Json = Record<string, unknown>

/**
 * Short phrases Vapi says while a slower tool runs, so the caller never hears dead air.
 * Portuguese and English variants: Vapi picks the caller's language (and translates for others).
 */
const WAIT_MESSAGES: Record<string, [pt: string, en: string]> = {
  lookup_patient: ['Um momento, por favor, vou confirmar.', 'One moment, please, let me check.'],
  check_availability: ['Um momento, vou ver a agenda.', 'One moment, let me look at the diary.'],
  book_appointment: ['Um momento, vou fazer a marcação.', 'One moment, I am booking it now.'],
  reschedule_appointment: ['Um momento, vou alterar a marcação.', 'One moment, I am changing the appointment.'],
  cancel_appointment: ['Um momento, por favor.', 'One moment, please.'],
  create_callback_request: ['Um momento, vou registar o pedido.', 'One moment, I am noting your request.'],
}
const FAILED_MESSAGE: [pt: string, en: string] = [
  'Peço desculpa, tive um problema técnico. Posso pedir à receção que lhe ligue de volta.',
  'I am sorry, I had a technical problem. I can ask reception to call you back.',
]
const spoken = ([pt, en]: [string, string]) => [
  { type: 'text', text: pt, language: 'pt' },
  { type: 'text', text: en, language: 'en' },
]

export function buildTools(input: Pick<BuildInput, 'settings' | 'baseUrl' | 'webhookSecret' | 'snapshot'>): Json[] {
  const server = { url: `${input.baseUrl}/api/webhooks/vapi`, timeoutSeconds: 20, headers: { 'x-vapi-secret': input.webhookSecret } }
  const crmTools: Json[] = TOOL_DEFINITIONS.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
    server,
    messages: [
      ...(WAIT_MESSAGES[t.name] ? [{ type: 'request-start', contents: spoken(WAIT_MESSAGES[t.name]) }] : []),
      { type: 'request-failed', contents: spoken(FAILED_MESSAGE) },
    ],
  }))
  const transferNumber = transferTarget(input.settings, input.snapshot)
  const transfer: Json[] = transferNumber
    ? [{
        type: 'transferCall',
        function: {
          name: 'transfer_call',
          description: 'Transfere a chamada para a receção da clínica. Usa só depois de transfer_to_human ter indicado que se pode transferir.',
        },
        destinations: [{ type: 'number', number: transferNumber, message: '', description: 'Receção da clínica' }],
      }]
    : []
  const endCall: Json = {
    type: 'endCall',
    function: {
      name: 'end_call',
      description: 'Termina a chamada. Usa depois de te despedires, quando a pessoa já não precisa de mais nada, ou se a pessoa desligar ou ficar em silêncio depois de verificares se ainda está em linha.',
    },
  }
  return [...crmTools, ...transfer, endCall]
}

/** The complete assistant returned to Vapi's assistant-request. */
export function buildTransientAssistant(input: BuildInput): Json {
  const { settings, now } = input
  const snap = input.snapshot ?? null
  const model = {
    ...DEFAULT_MODEL,
    ...(snap?.model?.provider && snap.model.model ? { provider: snap.model.provider, model: snap.model.model } : {}),
    temperature: 0.3,
    maxTokens: Math.max(250, snap?.model?.maxTokens ?? 0),
    messages: [{ role: 'system', content: buildSystemPrompt(input) }],
    tools: buildTools(input),
  }
  const server = { url: `${input.baseUrl}/api/webhooks/vapi`, timeoutSeconds: 20, headers: { 'x-vapi-secret': input.webhookSecret } }
  const assistant: Json = {
    name: settings.voiceAgent.name || 'Acácia',
    firstMessage: buildFirstMessage(settings, now),
    firstMessageMode: 'assistant-speaks-first',
    model,
    voice: isPortugueseVoice(snap?.voice) ? snap!.voice : DEFAULT_VOICE,
    transcriber: portugueseTranscriber(snap?.transcriber, transcriberVocabulary(settings)),
    // Inbound clinic line: never a voicemail on the other side; the clinic is a quiet room.
    voicemailDetection: 'off',
    backgroundSound: 'off',
    // Callers ring from cafés and cars: Krisp removes background voices and noise.
    backgroundSpeechDenoisingPlan: { smartDenoisingPlan: { enabled: true } },
    maxDurationSeconds: 600,
    // Portuguese callers pause while saying dates of birth and phone numbers: wait a little longer on numbers.
    startSpeakingPlan: { waitSeconds: 0.6, transcriptionEndpointingPlan: { onPunctuationSeconds: 0.1, onNoPunctuationSeconds: 1.2, onNumberSeconds: 0.9 } },
    stopSpeakingPlan: { numWords: 2, voiceSeconds: 0.3, backoffSeconds: 1 },
    // Silence: check in after 8 s (at most twice); after 30 s of silence say goodbye and hang up.
    hooks: [
      {
        on: 'customer.speech.timeout',
        options: { timeoutSeconds: 8, triggerMaxCount: 2, triggerResetMode: 'onUserSpeech' },
        do: [{ type: 'say', exact: ['Ainda está em linha?', 'Consegue ouvir-me?'] }],
      },
      {
        on: 'customer.speech.timeout',
        options: { timeoutSeconds: 30, triggerMaxCount: 1 },
        do: [
          { type: 'say', exact: 'Como não estou a ouvir nada, vou terminar a chamada. Se precisar, ligue-nos de novo. Obrigada.' },
          { type: 'tool', tool: { type: 'endCall' } },
        ],
      },
    ],
    endCallMessage: 'Obrigada pela sua chamada. Até breve.',
    artifactPlan: {
      recordingEnabled: true,
      recordingFormat: 'mp3',
      ...(input.structuredOutputId ? { structuredOutputIds: [input.structuredOutputId] } : {}),
    },
    // Fallback while no structured output has been set up in Vapi (still read by lib/voice/endOfCall.ts).
    ...(input.structuredOutputId ? {} : {
      analysisPlan: {
        summaryPlan: { enabled: true },
        structuredDataPlan: { enabled: true, schema: STRUCTURED_OUTPUT_SCHEMA },
      },
    }),
    server,
    serverMessages: ['end-of-call-report', 'status-update', 'hang'],
    metadata: { builtBy: 'crm', promptVersion: PROMPT_VERSION, builtAt: now.toISOString() },
  }
  return assistant
}

/** A copy safe to show in the browser: the webhook secret is masked. */
export function redactAssistant(a: Json): Json {
  return JSON.parse(JSON.stringify(a).replace(/("x-vapi-secret":")[^"]*"/g, '$1••••••••"'))
}
