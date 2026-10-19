/**
 * The voice-agent contract — one source of truth for:
 *   1. the tool definitions configured on the Vapi assistant (copy from
 *      Settings → AI Voice Agent → Setup, or GET /api/settings/voice-agent/contract),
 *   2. the structured-output schema Vapi fills in at the end of each call,
 *   3. the parser that reads that structured output back.
 *
 * Tool results are written in European Portuguese because Acácia speaks pt-PT.
 */

type JsonSchema = Record<string, unknown>

export type ToolDefinition = {
  name: string
  description: string
  parameters: { type: 'object'; properties: Record<string, JsonSchema>; required: string[] }
}

const FULL_NAME = { type: 'string', description: 'Nome completo do paciente (nome próprio e apelido), tal como dito pelo autor da chamada.' }
const DOB = { type: 'string', description: 'Data de nascimento do paciente, formato AAAA-MM-DD (ou DD/MM/AAAA).' }
const DATE = { type: 'string', description: 'Data no formato AAAA-MM-DD (hora de Lisboa).' }
const PROVIDER = {
  type: 'string',
  description: 'Opcional: nome do médico pedido pelo paciente (ex.: "Dra. Ana"). Sem pedido, deixe vazio — o sistema escolhe o médico habitual ou o primeiro disponível.',
}
const APPOINTMENT_TYPE = {
  type: 'string',
  enum: ['EVALUATION', 'HYGIENE', 'FOLLOW_UP', 'EMERGENCY', 'RESTORATIVE', 'ENDODONTICS', 'IMPLANT', 'ORTHODONTICS', 'AESTHETICS', 'SURGERY', 'OTHER'],
  description: 'Tipo de consulta. EVALUATION = consulta de avaliação, HYGIENE = higiene oral, FOLLOW_UP = controlo.',
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'lookup_patient',
    description:
      'Confirma a identidade de um paciente existente. Exige o nome completo E a data de nascimento. Devolve apenas se a identidade foi confirmada e a próxima consulta. Nunca devolve dados clínicos.',
    parameters: { type: 'object', properties: { full_name: FULL_NAME, date_of_birth: DOB }, required: ['full_name', 'date_of_birth'] },
  },
  {
    name: 'check_availability',
    description: 'Consulta horários livres para um dia. Se não houver vagas, indica o próximo dia disponível.',
    parameters: { type: 'object', properties: { date: DATE, appointment_type: APPOINTMENT_TYPE, provider: PROVIDER }, required: ['date'] },
  },
  {
    name: 'book_appointment',
    description:
      'Marca uma consulta para um paciente EXISTENTE já identificado (nome completo + data de nascimento). Novos pacientes não são marcados: use create_callback_request.',
    parameters: {
      type: 'object',
      properties: {
        full_name: FULL_NAME,
        date_of_birth: DOB,
        date: DATE,
        time: { type: 'string', description: 'Hora de início HH:MM (24h, hora de Lisboa).' },
        appointment_type: APPOINTMENT_TYPE,
        provider: PROVIDER,
        notes: { type: 'string', description: 'Motivo breve, sem detalhes clínicos desnecessários.' },
      },
      required: ['full_name', 'date_of_birth', 'date', 'time', 'appointment_type'],
    },
  },
  {
    name: 'reschedule_appointment',
    description: 'Remarca a consulta de um paciente identificado de uma data para outra data/hora.',
    parameters: {
      type: 'object',
      properties: {
        full_name: FULL_NAME,
        date_of_birth: DOB,
        current_date: { ...DATE, description: 'Data da consulta atual (AAAA-MM-DD).' },
        new_date: { ...DATE, description: 'Nova data (AAAA-MM-DD).' },
        new_time: { type: 'string', description: 'Nova hora HH:MM (24h).' },
      },
      required: ['full_name', 'date_of_birth', 'current_date', 'new_date', 'new_time'],
    },
  },
  {
    name: 'cancel_appointment',
    description: 'Desmarca a consulta de um paciente identificado numa data.',
    parameters: {
      type: 'object',
      properties: {
        full_name: FULL_NAME,
        date_of_birth: DOB,
        appointment_date: { ...DATE, description: 'Data da consulta a desmarcar (AAAA-MM-DD).' },
        reason: { type: 'string', description: 'Motivo indicado pelo paciente.' },
      },
      required: ['full_name', 'date_of_birth', 'appointment_date'],
    },
  },
  {
    name: 'create_callback_request',
    description:
      'Regista um pedido para a receção ligar de volta: novos pacientes, pedidos que o assistente não pode resolver, urgências fora de horas. O número do autor da chamada é usado se não for indicado outro.',
    parameters: {
      type: 'object',
      properties: {
        caller_name: { type: 'string', description: 'Nome do autor da chamada.' },
        phone: { type: 'string', description: 'Número para ligar de volta, se diferente do número da chamada.' },
        reason: { type: 'string', description: 'Motivo do contacto, numa frase.' },
        urgency: { type: 'string', enum: ['low', 'normal', 'urgent'], description: 'urgent = dor forte, inchaço, trauma ou hemorragia.' },
        is_new_patient: { type: 'boolean', description: 'true se nunca foi paciente da clínica.' },
      },
      required: ['caller_name', 'reason'],
    },
  },
  {
    name: 'transfer_to_human',
    description: 'Regista o contexto antes de transferir a chamada para a receção. Indica se a clínica está aberta e para que número transferir.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Porque é necessária uma pessoa.' },
        patient_name: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'verify_insurance',
    description: 'Indica se a clínica trabalha com um seguro ou acordo (ex.: AdvanceCare, RNA-ADE).',
    parameters: { type: 'object', properties: { plan_name: { type: 'string' } }, required: ['plan_name'] },
  },
  {
    name: 'get_opening_hours',
    description: 'Horário da clínica, se está aberta agora e próximos encerramentos/feriados.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'answer_question',
    description: 'Procura a resposta aprovada pela clínica para uma pergunta frequente (preços, serviços, pagamentos, localização, políticas).',
    parameters: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
  },
]

export const TOOL_NAMES = TOOL_DEFINITIONS.map((t) => t.name)

/** Legacy tool names still answered safely if an old assistant config calls them. */
export const LEGACY_TOOL_NAMES = ['submit_refill_request', 'send_intake_forms'] as const

// ─── Structured output (Vapi analysisPlan.structuredDataSchema) ──────────────

export const CALL_OUTCOMES = ['BOOKED', 'RESCHEDULED', 'CANCELLED', 'CALLBACK_REQUESTED', 'TRANSFERRED', 'INFO_PROVIDED', 'VOICEMAIL', 'HUNG_UP'] as const
export const CALL_INTENTS = ['APPOINTMENT_BOOKING', 'CANCELLATION', 'INQUIRY', 'EMERGENCY', 'COMPLAINT', 'ROUTING', 'GENERAL'] as const

/** Only call_outcome is required, so the model never invents the other values. */
export const STRUCTURED_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    call_outcome: { type: 'string', enum: [...CALL_OUTCOMES], description: 'Resultado principal da chamada.' },
    caller_intent: { type: 'string', enum: [...CALL_INTENTS], description: 'Motivo principal da chamada.' },
    is_new_patient: { type: 'boolean', description: 'true se o autor da chamada disse nunca ter sido paciente.' },
    urgent: { type: 'boolean', description: 'true se foi descrita dor forte, inchaço, trauma ou hemorragia.' },
    caller_name: { type: 'string', description: 'Nome do autor da chamada, se foi dito.' },
  },
  required: ['call_outcome'],
} as const

export type ParsedStructured = {
  outcome: (typeof CALL_OUTCOMES)[number] | null
  intent: (typeof CALL_INTENTS)[number] | null
  isNewPatient: boolean | null
  urgent: boolean | null
  callerName: string | null
}

function readEnum<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toUpperCase()
  return (allowed as readonly string[]).includes(v) ? (v as T[number]) : null
}

/**
 * Reads Vapi's structured output. Accepts the contract field names and the
 * legacy camelCase ones (callIntent, appointmentConfirmed, wasEscalated) so
 * existing assistants keep working until their schema is updated.
 */
export function parseStructuredData(raw: unknown): ParsedStructured {
  const sd = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  let outcome = readEnum(sd.call_outcome, CALL_OUTCOMES)
  if (!outcome && sd.appointmentConfirmed === true) outcome = 'BOOKED'
  if (!outcome && sd.wasEscalated === true) outcome = 'TRANSFERRED'
  const intent = readEnum(sd.caller_intent ?? sd.callIntent, CALL_INTENTS)
  const bool = (v: unknown) => (typeof v === 'boolean' ? v : null)
  const name = sd.caller_name ?? sd.callerName
  return {
    outcome,
    intent,
    isNewPatient: bool(sd.is_new_patient ?? sd.isNewPatient),
    urgent: bool(sd.urgent),
    callerName: typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : null,
  }
}

/** The CRM's CallOutcome enum is coarser than the contract; this is the one mapping. */
export function toCallOutcomeEnum(outcome: ParsedStructured['outcome']): 'BOOKED' | 'INFO_PROVIDED' | 'TRANSFERRED' | 'HUNG_UP' | 'VOICEMAIL' | null {
  switch (outcome) {
    case 'BOOKED':
    case 'RESCHEDULED':
      return 'BOOKED'
    case 'TRANSFERRED':
      return 'TRANSFERRED'
    case 'VOICEMAIL':
      return 'VOICEMAIL'
    case 'HUNG_UP':
      return 'HUNG_UP'
    case 'CANCELLED':
    case 'CALLBACK_REQUESTED':
    case 'INFO_PROVIDED':
      return 'INFO_PROVIDED'
    default:
      return null
  }
}

// ─── Required prompt clauses (checked by the prompt checker) ─────────────────

export const REQUIRED_PROMPT_CLAUSES: { id: string; label: string; patterns: RegExp[] }[] = [
  {
    id: 'ai_disclosure',
    label: 'Says it is a virtual/AI assistant',
    patterns: [/assistente virtual/i, /intelig[eê]ncia artificial/i, /\bIA\b/, /virtual assistant/i, /\bAI\b/],
  },
  {
    id: 'recording_disclosure',
    label: 'Discloses that the call may be recorded (GDPR transparency)',
    patterns: [/grava(da|ção|r)/i, /recorded/i, /recording/i],
  },
  {
    id: 'identity_verification',
    label: 'Verifies full name + date of birth before discussing appointments',
    patterns: [/data de nascimento/i, /date of birth/i],
  },
  {
    id: 'no_medical_advice',
    label: 'Gives no clinical/medical advice',
    patterns: [/n[ãa]o (d[áa]|dar|forne[çc]a|fornece)[^.]{0,40}(conselho|aconselhamento|diagn[óo]stico)/i, /no (medical|clinical) advice/i, /never (give|provide)[^.]{0,30}(medical|clinical) advice/i],
  },
  {
    id: 'emergency_path',
    label: 'Urgent-symptom path (112 / transfer / urgent callback)',
    patterns: [/\b112\b/, /urg[êe]ncia/i, /emergenc/i],
  },
  {
    id: 'new_patient_rule',
    label: 'New patients get a callback (not booked directly)',
    patterns: [/novos? pacientes?/i, /new patients?/i],
  },
]

export function checkPromptClauses(prompt: string): { id: string; label: string; present: boolean }[] {
  return REQUIRED_PROMPT_CLAUSES.map((c) => ({ id: c.id, label: c.label, present: c.patterns.some((p) => p.test(prompt)) }))
}
