/**
 * Answer to Vapi's `assistant-request` (inbound call on a number without a fixed assistant).
 * Must answer within 7.5 s: one settings read, one optional patient-by-phone lookup, no Vapi calls.
 *
 *  - CRM-built assistant switched on → the transient assistant (lib/voice/transientAssistant.ts)
 *  - switched off → the saved assistant (Settings → Vapi → assistant ID), i.e. exactly today's Acácia
 *  - nothing configured / an error → the saved assistant if there is one, else a spoken apology
 */
import { getClinicSettings } from '@/lib/clinic/settings'
import { appBaseUrl } from '@/lib/auth/passwordTokens'
import { getVapiConfig } from '@/lib/voice/vapiApi'
import { findPatientIdByPhone } from '@/lib/voice/endOfCall'
import { buildTransientAssistant } from '@/lib/voice/transientAssistant'

export type AssistantRequestAnswer =
  | { kind: 'transient'; body: { assistant: Record<string, unknown> } }
  | { kind: 'saved'; body: { assistantId: string } }
  | { kind: 'error'; body: { error: string } }

const SORRY = 'Peço desculpa, de momento não consigo atender. Por favor ligue mais tarde ou envie uma mensagem para a clínica.'

export async function answerAssistantRequest(callerPhone: string | null, now = new Date()): Promise<AssistantRequestAnswer> {
  let savedId: string | null = null
  try {
    const cfg = await getVapiConfig()
    savedId = cfg?.assistantId ?? null
    if (!cfg?.transientEnabled) {
      return savedId ? { kind: 'saved', body: { assistantId: savedId } } : { kind: 'error', body: { error: SORRY } }
    }
    const secret = process.env.VAPI_WEBHOOK_SECRET?.trim() ?? ''
    const [settings, patientId] = await Promise.all([
      getClinicSettings(),
      callerPhone ? findPatientIdByPhone(callerPhone).catch(() => null) : Promise.resolve(null),
    ])
    const assistant = buildTransientAssistant({
      settings, now, baseUrl: appBaseUrl(), webhookSecret: secret, snapshot: cfg.snapshot, structuredOutputId: cfg.structuredOutputId, callerKnown: !!patientId,
    })
    return { kind: 'transient', body: { assistant } }
  } catch (error) {
    console.error('[vapi] assistant-request failed:', (error as Error).message)
    return savedId ? { kind: 'saved', body: { assistantId: savedId } } : { kind: 'error', body: { error: SORRY } }
  }
}
