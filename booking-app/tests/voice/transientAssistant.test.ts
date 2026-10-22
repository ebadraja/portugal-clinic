import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }))

import { buildClinicSettings } from '@/lib/clinic/settings'
import { checkPromptClauses } from '@/lib/voice/contract'
import { pickStructuredData } from '@/lib/voice/endOfCall'
import { buildFirstMessage, buildSystemPrompt, buildTransientAssistant, greetingFor, nextOpening, redactAssistant, transferTarget } from '@/lib/voice/transientAssistant'

const settings = buildClinicSettings(null)
const base = { settings, baseUrl: 'https://crm.example', webhookSecret: 'secret-123' }
// Tuesday 20 Oct 2026, 10:00 Lisbon (UTC+1 in October)
const tuesdayMorning = new Date('2026-10-20T09:00:00Z')
// Sunday 25 Oct 2026, 11:00 Lisbon
const sunday = new Date('2026-10-25T11:00:00Z')

describe('CRM-built Vapi assistant', () => {
  it('the prompt has every clause the clinic requires (AI, recording, identity, no advice, emergencies, new patients)', () => {
    const prompt = buildSystemPrompt({ ...base, now: tuesdayMorning }) + ' ' + buildFirstMessage(settings, tuesdayMorning)
    for (const c of checkPromptClauses(prompt)) expect(c.present, c.label).toBe(true)
  })

  it('carries live clinic data and no template tags', () => {
    const open = buildSystemPrompt({ ...base, now: tuesdayMorning })
    expect(open).toContain('A clínica está aberta neste momento')
    expect(open).toContain('terça-feira')
    expect(open).not.toContain('{{')
    const closed = buildSystemPrompt({ ...base, now: sunday })
    expect(closed).toMatch(/fechada neste momento; reabre amanhã às 09:30/)
  })

  it('greets by time of day in Lisbon', () => {
    expect(greetingFor(new Date('2026-10-20T08:00:00Z'), 'Europe/Lisbon')).toBe('bom dia')
    expect(greetingFor(new Date('2026-10-20T14:00:00Z'), 'Europe/Lisbon')).toBe('boa tarde')
    expect(greetingFor(new Date('2026-10-20T20:30:00Z'), 'Europe/Lisbon')).toBe('boa noite')
    expect(buildFirstMessage(settings, tuesdayMorning)).toMatch(/bom dia, fala a Acácia, a assistente virtual\. Esta chamada pode ser gravada/)
  })

  it('knows when the clinic reopens (lunch, weekend)', () => {
    expect(nextOpening(settings, new Date('2026-10-20T12:00:00Z'))).toMatch(/^hoje às 14:00$/) // 13:00 Lisbon, lunch
    expect(nextOpening(settings, sunday)).toBe('amanhã às 09:30')
  })

  it('every CRM tool points at the webhook with the secret; transfer goes to the clinic in E.164', () => {
    const a = buildTransientAssistant({ ...base, now: tuesdayMorning })
    const tools = (a.model as { tools: Record<string, unknown>[] }).tools
    const fn = tools.filter((t) => t.type === 'function')
    expect(fn).toHaveLength(10)
    for (const t of fn) expect(t.server).toEqual({ url: 'https://crm.example/api/webhooks/vapi', timeoutSeconds: 20, headers: { 'x-vapi-secret': 'secret-123' } })
    const transfer = tools.find((t) => t.type === 'transferCall') as { destinations: { number: string; message: string }[] }
    expect(transfer.destinations[0]).toMatchObject({ number: '+351928494871', message: '' })
    expect(tools.some((t) => t.type === 'endCall')).toBe(true)
  })

  it('never transfers to the number Vapi itself answers (it would ring Acácia again)', () => {
    expect(transferTarget(settings, null)).toBe('+351928494871')
    const loop = { phoneNumber: '+351 928 494 871' }
    expect(transferTarget(settings, loop)).toBeNull()
    const a = buildTransientAssistant({ ...base, now: tuesdayMorning, snapshot: loop })
    expect((a.model as { tools: { type: string }[] }).tools.some((t) => t.type === 'transferCall')).toBe(false)
    expect(buildSystemPrompt({ ...base, now: tuesdayMorning, snapshot: loop })).toContain('não é possível transferir chamadas')
  })

  it('uses the saved voice when copied, a Portuguese default otherwise', () => {
    const copied = buildTransientAssistant({ ...base, now: tuesdayMorning, snapshot: { voice: { provider: '11labs', voiceId: 'v1' }, transcriber: { provider: 'deepgram', language: 'pt-PT' } } })
    expect(copied.voice).toEqual({ provider: '11labs', voiceId: 'v1' })
    const fallback = buildTransientAssistant({ ...base, now: tuesdayMorning })
    expect(fallback.voice).toEqual({ provider: 'azure', voiceId: 'pt-PT-RaquelNeural' })
    expect(fallback.transcriber).toMatchObject({ language: 'pt-PT' })
  })

  it('first test call (22 Oct): an English-only voice and an English-locked transcriber are made Portuguese', () => {
    const a = buildTransientAssistant({
      ...base,
      now: tuesdayMorning,
      snapshot: {
        voice: { provider: 'vapi', voiceId: 'Elliot', version: '2' },
        transcriber: { provider: 'soniox', model: 'stt-rt-v5', language: 'en', languages: ['en'], fallbackPlan: { autoFallback: { enabled: true } } },
      },
    })
    expect(a.voice).toEqual({ provider: 'azure', voiceId: 'pt-PT-RaquelNeural' })
    expect(a.transcriber).toMatchObject({ provider: 'soniox', model: 'stt-rt-v5', language: 'pt', languages: ['pt', 'en', 'es'], fallbackPlan: { autoFallback: { enabled: true } } })
    expect((a.transcriber as { customVocabulary: string[] }).customVocabulary).toContain('Acácia')
    // Azure only counts as Portuguese with a pt-* voice; Deepgram is moved off English.
    const b = buildTransientAssistant({ ...base, now: tuesdayMorning, snapshot: { voice: { provider: 'azure', voiceId: 'en-US-JennyNeural' }, transcriber: { provider: 'deepgram', model: 'nova-2', language: 'en' } } })
    expect(b.voice).toEqual({ provider: 'azure', voiceId: 'pt-PT-RaquelNeural' })
    expect(b.transcriber).toMatchObject({ provider: 'deepgram', language: 'pt-PT' })
  })

  it('keeps the caller’s language after tools, never assumes gender, asks for a surname before the lookup', () => {
    const prompt = buildSystemPrompt({ ...base, now: tuesdayMorning })
    expect(prompt).toMatch(/também depois de usares uma ferramenta/)
    expect(prompt).not.toMatch(/\("o senhor", "a senhora"/)
    expect(prompt).toMatch(/"Mr\.", "Mrs\."/)
    expect(prompt).toMatch(/se a pessoa disser só um nome, pede o outro/)
    const lookup = (buildTransientAssistant({ ...base, now: tuesdayMorning }).model as { tools: { function?: { name: string }; messages?: { type: string; contents: { language: string }[] }[] }[] }).tools.find((t) => t.function?.name === 'lookup_patient')!
    expect(lookup.messages!.map((m) => m.contents.map((c) => c.language))).toEqual([['pt', 'en'], ['pt', 'en']])
  })

  it('structured output when set up, legacy analysis plan otherwise', () => {
    const withSo = buildTransientAssistant({ ...base, now: tuesdayMorning, structuredOutputId: 'so-1' })
    expect((withSo.artifactPlan as { structuredOutputIds: string[] }).structuredOutputIds).toEqual(['so-1'])
    expect(withSo.analysisPlan).toBeUndefined()
    const without = buildTransientAssistant({ ...base, now: tuesdayMorning })
    expect(without.analysisPlan).toBeDefined()
  })

  it('the browser preview never shows the webhook secret', () => {
    const shown = JSON.stringify(redactAssistant(buildTransientAssistant({ ...base, now: tuesdayMorning })))
    expect(shown).not.toContain('secret-123')
  })

  it('end-of-call reads the CRM structured output first, then any, then the analysis plan', () => {
    expect(pickStructuredData({ artifact: { structuredOutputs: { a: { name: 'other', result: { x: 1 } }, b: { name: 'acacia_call_result', result: { call_outcome: 'BOOKED' } } } } })).toEqual({ call_outcome: 'BOOKED' })
    expect(pickStructuredData({ artifact: { structuredOutputs: { a: { name: 'other', result: { x: 1 } } } } })).toEqual({ x: 1 })
    expect(pickStructuredData({ analysis: { structuredData: { call_outcome: 'HUNG_UP' } } })).toEqual({ call_outcome: 'HUNG_UP' })
  })
})
