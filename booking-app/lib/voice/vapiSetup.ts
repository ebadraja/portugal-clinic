/**
 * One-click Vapi setup for the CRM-built assistant (Settings → AI Voice Agent → Vapi):
 *   1. copy voice / transcriber / model from the saved assistant (so Acácia sounds the same),
 *   2. create or update the "acacia_call_result" structured output,
 *   3. create or update a saved PREVIEW assistant with exactly what calls would get, so it can be
 *      test-called from the Vapi dashboard. Vapi validating it is the proof the configuration works.
 * Pointing the clinic number at the CRM is separate (pointPhoneNumber) and only on request.
 */
import prisma from '@/lib/prisma'
import { getClinicSettings } from '@/lib/clinic/settings'
import { appBaseUrl } from '@/lib/auth/passwordTokens'
import { STRUCTURED_OUTPUT_NAME, STRUCTURED_OUTPUT_SCHEMA } from '@/lib/voice/contract'
import { buildTransientAssistant, isPortugueseVoice, transferTarget } from '@/lib/voice/transientAssistant'
import { type AssistantSnapshot, type VapiConfig, snapshotOf, vapiErrorMessage, vapiFetch } from '@/lib/voice/vapiApi'

export type SetupStep = { step: string; ok: boolean; detail: string }

const PREVIEW_NAME = 'Acácia (CRM) — pré-visualização'

export async function runVapiSetup(cfg: VapiConfig, now = new Date()): Promise<{ steps: SetupStep[]; ok: boolean }> {
  const steps: SetupStep[] = []
  const secret = process.env.VAPI_WEBHOOK_SECRET?.trim() ?? ''
  if (!cfg.apiKey) return { ok: false, steps: [{ step: 'API key', ok: false, detail: 'Save the Vapi private key first.' }] }
  if (!secret) steps.push({ step: 'Webhook secret', ok: false, detail: 'VAPI_WEBHOOK_SECRET is not set on the server — Vapi requests to the CRM would be refused.' })

  // 1. Voice / transcriber / model from the saved assistant
  let snapshot: AssistantSnapshot | null = cfg.snapshot
  if (cfg.assistantId) {
    const a = await vapiFetch<{ name?: string; voice?: unknown; transcriber?: unknown; model?: unknown }>(`/assistant/${encodeURIComponent(cfg.assistantId)}`, cfg.apiKey)
    if (a.ok && a.json) {
      snapshot = { ...snapshotOf(a.json), phoneNumber: cfg.snapshot?.phoneNumber ?? null }
      await prisma.settings.updateMany({ data: { vapiAssistantSnapshot: snapshot as object } })
      const v = (snapshot.voice ?? {}) as { provider?: string; voiceId?: string }
      steps.push(isPortugueseVoice(snapshot.voice)
        ? { step: 'Voice', ok: true, detail: `Copied from "${a.json.name ?? cfg.assistantId}". The transcriber is set to Portuguese (with English and Spanish).` }
        : { step: 'Voice', ok: true, detail: `"${a.json.name ?? cfg.assistantId}" uses ${v.voiceId ?? 'a voice'} (${v.provider ?? '?'}), which cannot speak Portuguese — using the Portuguese voice pt-PT Raquel instead. To use your own, pick a Portuguese voice on that assistant in Vapi and press Set up again.` })
    } else {
      steps.push({ step: 'Voice', ok: false, detail: `${vapiErrorMessage(a, 'Could not read the saved assistant')} — using the default Portuguese voice.` })
    }
  } else {
    steps.push({ step: 'Voice', ok: true, detail: 'No saved assistant set — using the default Portuguese voice (pt-PT Raquel).' })
  }

  // 1b. The number Vapi answers: a transfer to that same number would ring Acácia again
  if (cfg.phoneNumberId) {
    const p = await vapiFetch<{ number?: string }>(`/phone-number/${encodeURIComponent(cfg.phoneNumberId)}`, cfg.apiKey)
    if (p.ok && p.json?.number) {
      snapshot = { ...(snapshot ?? {}), phoneNumber: p.json.number }
      await prisma.settings.updateMany({ data: { vapiAssistantSnapshot: snapshot as object } })
    }
  }
  const clinicSettings = await getClinicSettings()
  const target = transferTarget(clinicSettings, snapshot)
  steps.push(target
    ? { step: 'Transfer', ok: true, detail: `"Falar com alguém" transfers to ${target} (Settings → AI Voice Agent → transfer number).` }
    : { step: 'Transfer', ok: false, detail: 'The transfer number is missing or is the same number Vapi answers (it would ring Acácia again). Transfers are off — callers get a callback. Set the reception line in Settings → AI Voice Agent.' })

  // 2. Structured output
  let soId = cfg.structuredOutputId
  const soBody = {
    name: STRUCTURED_OUTPUT_NAME,
    type: 'ai',
    description: 'Resultado da chamada da Acácia para o CRM (Call Logs).',
    schema: STRUCTURED_OUTPUT_SCHEMA,
  }
  let so = soId ? await vapiFetch<{ id: string }>(`/structured-output/${encodeURIComponent(soId)}`, cfg.apiKey, { method: 'PATCH', body: JSON.stringify(soBody) }) : null
  if (!so || !so.ok) so = await vapiFetch<{ id: string }>('/structured-output', cfg.apiKey, { method: 'POST', body: JSON.stringify(soBody) })
  if (so.ok && so.json?.id) {
    soId = so.json.id
    await prisma.settings.updateMany({ data: { vapiStructuredOutputId: soId } })
    steps.push({ step: 'Structured output', ok: true, detail: `"${STRUCTURED_OUTPUT_NAME}" ready.` })
  } else {
    soId = null
    steps.push({ step: 'Structured output', ok: false, detail: `${vapiErrorMessage(so, 'Vapi refused the structured output')} — calls fall back to the analysis plan.` })
  }

  // 3. Preview assistant = exactly what a call would get right now
  const settings = clinicSettings
  const built = buildTransientAssistant({ settings, now, baseUrl: appBaseUrl(), webhookSecret: secret, snapshot, structuredOutputId: soId })
  const previewBody = { ...built, name: PREVIEW_NAME }
  let pv = cfg.previewAssistantId
    ? await vapiFetch<{ id: string }>(`/assistant/${encodeURIComponent(cfg.previewAssistantId)}`, cfg.apiKey, { method: 'PATCH', body: JSON.stringify(previewBody) })
    : null
  if (!pv || !pv.ok) pv = await vapiFetch<{ id: string }>('/assistant', cfg.apiKey, { method: 'POST', body: JSON.stringify(previewBody) })
  if (pv.ok && pv.json?.id) {
    await prisma.settings.updateMany({ data: { vapiPreviewAssistantId: pv.json.id } })
    steps.push({ step: 'Preview assistant', ok: true, detail: `Vapi accepted the configuration. Test it in Vapi → Assistants → "${PREVIEW_NAME}" → Talk. The preview's date, time and "open/closed" are frozen at the moment you pressed Set up; real calls are built fresh each time.` })
  } else {
    steps.push({ step: 'Preview assistant', ok: false, detail: vapiErrorMessage(pv, 'Vapi refused the assistant configuration') })
  }
  await prisma.settings.updateMany({ data: { vapiLastSync: new Date() } })
  return { ok: steps.every((s) => s.ok), steps }
}

/**
 * Point the clinic number at the CRM (the CRM then chooses: CRM-built assistant, or the saved one
 * when the switch is off), or back to the saved assistant directly.
 */
export async function pointPhoneNumber(cfg: VapiConfig, target: 'crm' | 'saved'): Promise<SetupStep> {
  if (!cfg.apiKey || !cfg.phoneNumberId) return { step: 'Phone number', ok: false, detail: 'Save the key and pick the clinic phone number first.' }
  const secret = process.env.VAPI_WEBHOOK_SECRET?.trim() ?? ''
  if (target === 'crm' && !secret) return { step: 'Phone number', ok: false, detail: 'VAPI_WEBHOOK_SECRET is not set on the server.' }
  if (target === 'saved' && !cfg.assistantId) return { step: 'Phone number', ok: false, detail: 'No saved assistant to point back to.' }
  const body = target === 'crm'
    ? { assistantId: null, squadId: null, server: { url: `${appBaseUrl()}/api/webhooks/vapi`, timeoutSeconds: 20, headers: { 'x-vapi-secret': secret } } }
    : { assistantId: cfg.assistantId }
  const r = await vapiFetch(`/phone-number/${encodeURIComponent(cfg.phoneNumberId)}`, cfg.apiKey, { method: 'PATCH', body: JSON.stringify(body) })
  return r.ok
    ? { step: 'Phone number', ok: true, detail: target === 'crm' ? 'The clinic number now asks the CRM which assistant answers.' : 'The clinic number is answered by the saved assistant again.' }
    : { step: 'Phone number', ok: false, detail: vapiErrorMessage(r, 'Vapi refused the phone number change') }
}
