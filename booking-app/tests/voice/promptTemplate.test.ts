import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }))

import { buildClinicSettings } from '@/lib/clinic/settings'
import { checkPromptClauses } from '@/lib/voice/contract'
import { checkTemplates } from '@/lib/voice/promptEditor'
import { DEFAULT_FIRST_MESSAGE_TEMPLATE, DEFAULT_PROMPT_TEMPLATE, PROMPT_VARIABLES, renderTemplate, unknownVariables } from '@/lib/voice/promptTemplate'
import { buildFirstMessage, buildSystemPrompt, promptVariables } from '@/lib/voice/transientAssistant'

const base = { settings: buildClinicSettings(null), baseUrl: 'https://crm.example', webhookSecret: 's' }
// Tuesday 20 Oct 2026, 10:00 Lisbon
const now = new Date('2026-10-20T09:00:00Z')
const withTemplates = (promptTemplate: string | null, firstMessageTemplate: string | null = null) =>
  ({ ...base.settings, voiceAgent: { ...base.settings.voiceAgent, promptTemplate, firstMessageTemplate } })

describe('editable prompt template', () => {
  it('the built-in template uses only known variables, and every variable has a value', () => {
    expect(unknownVariables(DEFAULT_PROMPT_TEMPLATE + DEFAULT_FIRST_MESSAGE_TEMPLATE)).toEqual([])
    const values = promptVariables({ ...base, now })
    for (const v of PROMPT_VARIABLES) expect(values[v.name], v.name).toBeTruthy()
  })

  it('renders the built-in text with live facts and no tags left', () => {
    const prompt = buildSystemPrompt({ ...base, now })
    expect(prompt).toContain('És a Acácia, a assistente virtual')
    expect(prompt).toContain('terça-feira')
    expect(prompt).not.toMatch(/\{\{|\}\}/)
    for (const c of checkPromptClauses(prompt + buildFirstMessage(base.settings, now))) expect(c.present, c.label).toBe(true)
  })

  it('an edited prompt and first message are used on the next call, with variables filled in', () => {
    const settings = withTemplates('Olá, sou a {{agent_name}}. Hoje é {{today}}. Médicos: {{dentists}}.', 'Bom dia, {{clinic_name}}.')
    const prompt = buildSystemPrompt({ ...base, settings, now })
    expect(prompt).toMatch(/^Olá, sou a Acácia\. Hoje é terça-feira/)
    expect(prompt).not.toContain('{{')
    expect(buildFirstMessage(settings, now)).toBe(`Bom dia, ${base.settings.practice.name}.`)
  })

  it('finds misspelt variables and never lets a tag through to Vapi', () => {
    expect(unknownVariables('{{dentist}} e {{ today }} e {{dentist}} e {{Agent_Name}}')).toEqual(['dentist', 'Agent_Name'])
    expect(renderTemplate('A {{dentist}} B {{ today }}', { today: 'hoje' } as Record<string, string>)).toBe('A  B hoje')
  })

  it('a save is refused without the required clauses, unknown variables or text', () => {
    const ok = checkTemplates(DEFAULT_PROMPT_TEMPLATE, DEFAULT_FIRST_MESSAGE_TEMPLATE, {
      prompt: buildSystemPrompt({ ...base, now }), firstMessage: buildFirstMessage(base.settings, now),
    })
    expect(ok.errors).toEqual([])

    const bad = checkTemplates('Marca consultas. {{dentist}}', '', { prompt: 'Marca consultas.', firstMessage: '' })
    expect(bad.unknown).toEqual(['dentist'])
    expect(bad.errors.join(' ')).toMatch(/first message is empty/)
    expect(bad.errors.join(' ')).toMatch(/Unknown variable: \{\{dentist\}\}/)
    expect(bad.errors.join(' ')).toMatch(/Required instructions missing: .*virtual.*recorded/)
  })
})
