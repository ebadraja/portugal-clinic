import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }))

import {
  CALL_OUTCOMES,
  STRUCTURED_OUTPUT_SCHEMA,
  TOOL_DEFINITIONS,
  checkPromptClauses,
  parseStructuredData,
  toCallOutcomeEnum,
} from '@/lib/voice/contract'
import { resolveCallResult, type ToolFacts } from '@/lib/voice/endOfCall'
import { runVoiceTool } from '@/lib/voice/tools'
import { buildClinicSettings } from '@/lib/clinic/settings'

const NO_FACTS: ToolFacts = { booked: [], rescheduled: [], cancelled: [], callbacks: [], urgentCallback: false }

describe('contract — tool definitions', () => {
  it('pins the tool names the assistant must be configured with', () => {
    expect(TOOL_DEFINITIONS.map((t) => t.name)).toEqual([
      'lookup_patient', 'check_availability', 'book_appointment', 'reschedule_appointment', 'cancel_appointment',
      'create_callback_request', 'transfer_to_human', 'verify_insurance', 'get_opening_hours', 'answer_question',
    ])
  })

  it('every patient-specific tool requires full name AND date of birth', () => {
    for (const name of ['lookup_patient', 'book_appointment', 'reschedule_appointment', 'cancel_appointment']) {
      const t = TOOL_DEFINITIONS.find((d) => d.name === name)!
      expect(t.parameters.required).toEqual(expect.arrayContaining(['full_name', 'date_of_birth']))
    }
  })

  it('every defined tool is handled by the dispatcher (no "unknown tool")', async () => {
    const ctx = { callId: null, callerPhone: null, now: new Date(), settings: { ...buildClinicSettings(null), voiceAgent: { ...buildClinicSettings(null).voiceAgent, paused: true } } }
    for (const t of TOOL_DEFINITIONS) {
      if (['create_callback_request', 'transfer_to_human', 'get_opening_hours'].includes(t.name)) continue
      // With the kill switch on, every gated tool answers without touching the database
      await expect(runVoiceTool(t.name, {}, ctx)).resolves.toMatch(/temporariamente limitado/)
    }
    await expect(runVoiceTool('no_such_tool', {}, { ...ctx, settings: buildClinicSettings(null) })).resolves.toMatch(/desconhecida/)
  })

  it('structured output requires only the outcome', () => {
    expect(STRUCTURED_OUTPUT_SCHEMA.required).toEqual(['call_outcome'])
    expect(STRUCTURED_OUTPUT_SCHEMA.properties.call_outcome.enum).toEqual([...CALL_OUTCOMES])
  })
})

describe('contract — parsing structured output', () => {
  it('reads contract fields', () => {
    expect(parseStructuredData({ call_outcome: 'callback_requested', caller_intent: 'INQUIRY', is_new_patient: true, urgent: false, caller_name: ' Rui ' })).toEqual({
      outcome: 'CALLBACK_REQUESTED', intent: 'INQUIRY', isNewPatient: true, urgent: false, callerName: 'Rui',
    })
  })

  it('still understands the legacy camelCase fields', () => {
    expect(parseStructuredData({ appointmentConfirmed: true, callIntent: 'APPOINTMENT_BOOKING' })).toMatchObject({ outcome: 'BOOKED', intent: 'APPOINTMENT_BOOKING' })
    expect(parseStructuredData({ wasEscalated: true })).toMatchObject({ outcome: 'TRANSFERRED' })
  })

  it('ignores invented values', () => {
    expect(parseStructuredData({ call_outcome: 'GREAT_SUCCESS', caller_intent: 42 })).toMatchObject({ outcome: null, intent: null })
    expect(parseStructuredData(null)).toMatchObject({ outcome: null })
  })

  it('maps to the CRM enum in one place', () => {
    expect(toCallOutcomeEnum('RESCHEDULED')).toBe('BOOKED')
    expect(toCallOutcomeEnum('CALLBACK_REQUESTED')).toBe('INFO_PROVIDED')
    expect(toCallOutcomeEnum(null)).toBe(null)
  })
})

describe('resolveCallResult — outcome precedence', () => {
  const base = { summary: '', transcript: 'Assistant: Olá\nUser: Olá\nAssistant: Adeus', messageCount: 5 }
  const none = parseStructuredData(null)

  it('a tool booking makes the call BOOKED even without structured output', () => {
    const r = resolveCallResult({ ...base, facts: { ...NO_FACTS, booked: ['a1'] }, structured: none })
    expect(r).toMatchObject({ outcome: 'BOOKED', intent: 'APPOINTMENT_BOOKING', outcomeSource: 'tools' })
  })

  it('the model cannot claim a booking the tools did not make', () => {
    const r = resolveCallResult({ ...base, facts: NO_FACTS, structured: parseStructuredData({ call_outcome: 'BOOKED' }), summary: 'Consulta marcada para terça' })
    expect(r.outcome).not.toBe('BOOKED')
  })

  it('callback requests flag the call for follow-up', () => {
    const r = resolveCallResult({ ...base, facts: { ...NO_FACTS, callbacks: ['c1'] }, structured: none })
    expect(r.flagForFollowUp).toBe(true)
  })

  it('an urgent callback makes the intent EMERGENCY', () => {
    const r = resolveCallResult({ ...base, facts: { ...NO_FACTS, callbacks: ['c1'], urgentCallback: true }, structured: none })
    expect(r.intent).toBe('EMERGENCY')
  })

  it('a cancellation sets the intent', () => {
    expect(resolveCallResult({ ...base, facts: { ...NO_FACTS, cancelled: ['a1'] }, structured: none }).intent).toBe('CANCELLATION')
  })

  it('voicemail wins and needs follow-up', () => {
    const r = resolveCallResult({ ...base, endedReason: 'voicemail', facts: NO_FACTS, structured: none })
    expect(r).toMatchObject({ outcome: 'VOICEMAIL', flagForFollowUp: true })
  })

  it('falls back to inference, labelled as such', () => {
    const r = resolveCallResult({ ...base, endedReason: 'silence-timed-out', facts: NO_FACTS, structured: none, messageCount: 1 })
    expect(r).toMatchObject({ outcome: 'HUNG_UP', outcomeSource: 'inferred' })
  })
})

describe('prompt clause checker', () => {
  it('lists what a pediatric/legacy prompt is missing', () => {
    const r = checkPromptClauses('You are Jenny, a friendly receptionist. Help callers book appointments.')
    expect(r.filter((c) => !c.present).map((c) => c.id)).toEqual(
      expect.arrayContaining(['ai_disclosure', 'recording_disclosure', 'identity_verification', 'no_medical_advice', 'emergency_path', 'new_patient_rule']),
    )
  })

  it('passes a compliant pt-PT prompt', () => {
    const prompt = `És a Acácia, assistente virtual da clínica. Informa que a chamada pode ser gravada.
Antes de falar de consultas, pede o nome completo e a data de nascimento.
Não dás conselhos clínicos nem diagnósticos. Em caso de urgência grave, indica o 112.
Novos pacientes: regista um pedido de chamada de volta.`
    expect(checkPromptClauses(prompt).every((c) => c.present)).toBe(true)
  })
})

describe('documented sample prompt (docs/voice/vapi-setup.md)', () => {
  it('passes every required clause', async () => {
    const { readFileSync } = await import('node:fs')
    const md = readFileSync('docs/voice/vapi-setup.md', 'utf8')
    const prompt = /```text\n([\s\S]*?)```/.exec(md)?.[1] ?? ''
    expect(prompt.length).toBeGreaterThan(200)
    const missing = checkPromptClauses(prompt).filter((c) => !c.present).map((c) => c.id)
    expect(missing).toEqual([])
  })
})
