/**
 * Server side of Settings → AI Voice Agent → "Acácia's instructions": what the editor shows, the
 * checks a save must pass, and the version history.
 */
import prisma from '@/lib/prisma'
import { getClinicSettings, type ClinicSettings } from '@/lib/clinic/settings'
import { getVapiConfig } from '@/lib/voice/vapiApi'
import { checkPromptClauses } from '@/lib/voice/contract'
import {
  DEFAULT_FIRST_MESSAGE_TEMPLATE, DEFAULT_PROMPT_TEMPLATE, FIRST_MESSAGE_MAX_LENGTH, PROMPT_MAX_LENGTH, PROMPT_VARIABLES,
  renderTemplate, unknownVariables,
} from '@/lib/voice/promptTemplate'
import { promptVariables } from '@/lib/voice/transientAssistant'

export type PromptCheck = {
  unknown: string[]
  clauses: { id: string; label: string; present: boolean }[]
  errors: string[]
}

/** Renders both texts for a call starting now; the snapshot decides whether transfers are possible. */
export async function renderForNow(prompt: string, firstMessage: string, settings?: ClinicSettings) {
  const [s, cfg] = await Promise.all([settings ?? getClinicSettings(), getVapiConfig()])
  const values = promptVariables({ settings: s, now: new Date(), baseUrl: '', webhookSecret: '', snapshot: cfg?.snapshot })
  return { prompt: renderTemplate(prompt, values), firstMessage: renderTemplate(firstMessage, values), values }
}

/** Everything that blocks a save: empty or too long, unknown {{tags}}, a required clause missing. */
export function checkTemplates(prompt: string, firstMessage: string, rendered: { prompt: string; firstMessage: string }): PromptCheck {
  const errors: string[] = []
  if (!prompt.trim()) errors.push('The prompt is empty.')
  if (!firstMessage.trim()) errors.push('The first message is empty.')
  if (prompt.length > PROMPT_MAX_LENGTH) errors.push(`The prompt is longer than ${PROMPT_MAX_LENGTH.toLocaleString('en')} characters.`)
  if (firstMessage.length > FIRST_MESSAGE_MAX_LENGTH) errors.push(`The first message is longer than ${FIRST_MESSAGE_MAX_LENGTH} characters.`)
  const unknown = unknownVariables(`${prompt}\n${firstMessage}`)
  if (unknown.length) errors.push(`Unknown variable${unknown.length > 1 ? 's' : ''}: ${unknown.map((u) => `{{${u}}}`).join(', ')}.`)
  const clauses = checkPromptClauses(`${rendered.prompt} ${rendered.firstMessage}`)
  const missing = clauses.filter((c) => !c.present)
  if (missing.length) errors.push(`Required instructions missing: ${missing.map((c) => c.label).join('; ')}.`)
  return { unknown, clauses, errors }
}

/** The editor's view: current texts, the built-in ones, the variables with today's values, the history. */
export async function getPromptEditorState() {
  const [settings, cfg, versions] = await Promise.all([
    getClinicSettings(),
    getVapiConfig(),
    prisma.voicePromptVersion.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }),
  ])
  const prompt = settings.voiceAgent.promptTemplate ?? DEFAULT_PROMPT_TEMPLATE
  const firstMessage = settings.voiceAgent.firstMessageTemplate ?? DEFAULT_FIRST_MESSAGE_TEMPLATE
  const { values } = await renderForNow(prompt, firstMessage, settings)
  return {
    prompt,
    firstMessage,
    isCustom: settings.voiceAgent.promptTemplate !== null || settings.voiceAgent.firstMessageTemplate !== null,
    defaults: { prompt: DEFAULT_PROMPT_TEMPLATE, firstMessage: DEFAULT_FIRST_MESSAGE_TEMPLATE },
    variables: PROMPT_VARIABLES.map((v) => ({ ...v, value: values[v.name] })),
    transientEnabled: !!cfg?.transientEnabled,
    versions: versions.map((v) => ({
      id: v.id, prompt: v.prompt, firstMessage: v.firstMessage, isDefault: v.isDefault, note: v.note,
      createdByName: v.createdByName, createdAt: v.createdAt.toISOString(),
    })),
  }
}

/**
 * Saves after the checks pass. Text equal to the built-in one is stored as NULL, so the clinic keeps
 * receiving improvements to the built-in prompt until it edits it.
 */
export async function savePrompt(input: { prompt: string; firstMessage: string; note: string | null; user: { id: string; firstName: string; lastName: string } }) {
  const prompt = input.prompt.replace(/\r\n/g, '\n')
  const firstMessage = input.firstMessage.replace(/\r\n/g, '\n').trim()
  const rendered = await renderForNow(prompt, firstMessage)
  const check = checkTemplates(prompt, firstMessage, rendered)
  if (check.errors.length) return { ok: false as const, check }

  const promptTemplate = prompt === DEFAULT_PROMPT_TEMPLATE ? null : prompt
  const firstMessageTemplate = firstMessage === DEFAULT_FIRST_MESSAGE_TEMPLATE ? null : firstMessage
  const isDefault = promptTemplate === null && firstMessageTemplate === null
  const createdByName = `${input.user.firstName} ${input.user.lastName}`.trim() || null

  const version = await prisma.$transaction(async (tx) => {
    const row = await tx.settings.findFirst({ select: { id: true } })
    if (row) await tx.settings.update({ where: { id: row.id }, data: { voicePromptTemplate: promptTemplate, voiceFirstMessageTemplate: firstMessageTemplate } })
    else await tx.settings.create({ data: { id: 'singleton', voicePromptTemplate: promptTemplate, voiceFirstMessageTemplate: firstMessageTemplate } })
    const v = await tx.voicePromptVersion.create({
      data: { prompt, firstMessage, isDefault, note: input.note?.trim().slice(0, 200) || null, createdById: input.user.id, createdByName },
    })
    await tx.auditLog.create({
      data: {
        userId: input.user.id, action: 'UPDATE', entity: 'settings', entityId: 'voice_prompt',
        changes: { versionId: v.id, isDefault, promptLength: prompt.length, note: v.note },
      },
    })
    return v
  })
  return { ok: true as const, versionId: version.id, check }
}
