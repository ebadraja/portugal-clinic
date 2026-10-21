/**
 * Vapi REST API access (https://docs.vapi.ai/api-reference). Server only: the private key is
 * decrypted here and never sent to a browser. Never throws on an HTTP error — a non-2xx body may
 * be text, so it is read as text and parsed defensively.
 */
import prisma from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'

export const VAPI_BASE_URL = 'https://api.vapi.ai'

export type VapiResult<T = unknown> = { ok: boolean; status: number; json: T | null; text: string }

export async function vapiFetch<T = unknown>(path: string, apiKey: string, init?: RequestInit): Promise<VapiResult<T>> {
  const res = await fetch(`${VAPI_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
    signal: init?.signal ?? AbortSignal.timeout(15_000),
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { ok: res.ok, status: res.status, json: json as T | null, text }
}

export function vapiErrorMessage(result: VapiResult, fallback: string): string {
  const body = result.json as { message?: unknown; error?: unknown } | null
  const m = body?.message
  if (typeof m === 'string' && m) return m
  if (Array.isArray(m) && m.length) return m.map(String).join('; ')
  if (body && typeof body.error === 'string' && body.error) return body.error
  const text = result.text.trim()
  if (text && text.length <= 300 && !text.startsWith('<')) return text
  return `${fallback} (HTTP ${result.status})`
}

/** Voice, transcriber and model of the saved assistant (copied so the CRM-built one sounds the same). */
export type AssistantSnapshot = {
  voice?: Record<string, unknown>
  transcriber?: Record<string, unknown>
  model?: { provider?: string; model?: string; temperature?: number; maxTokens?: number }
}

export type VapiConfig = {
  apiKey: string
  assistantId: string | null
  phoneNumberId: string | null
  lastSync: Date | null
  transientEnabled: boolean
  snapshot: AssistantSnapshot | null
  structuredOutputId: string | null
  previewAssistantId: string | null
}

/** Vapi connection from Settings, key decrypted. */
export async function getVapiConfig(): Promise<VapiConfig | null> {
  const s = await prisma.settings.findFirst({
    select: {
      vapiApiKey: true, vapiAssistantId: true, vapiPhoneNumberId: true, vapiLastSync: true, vapiTransientEnabled: true, vapiAssistantSnapshot: true,
      vapiStructuredOutputId: true, vapiPreviewAssistantId: true,
    },
  })
  if (!s) return null
  return {
    apiKey: s.vapiApiKey ? decrypt(s.vapiApiKey) : '',
    assistantId: s.vapiAssistantId,
    phoneNumberId: s.vapiPhoneNumberId,
    lastSync: s.vapiLastSync,
    transientEnabled: s.vapiTransientEnabled,
    snapshot: (s.vapiAssistantSnapshot as AssistantSnapshot | null) ?? null,
    structuredOutputId: s.vapiStructuredOutputId,
    previewAssistantId: s.vapiPreviewAssistantId,
  }
}

/** Keep only what decides how the assistant sounds and hears (never credentials or ids of other resources). */
export function snapshotOf(a: { voice?: unknown; transcriber?: unknown; model?: unknown } | null): AssistantSnapshot | null {
  if (!a) return null
  const strip = (o: unknown): Record<string, unknown> | undefined => {
    if (!o || typeof o !== 'object') return undefined
    const { credentialId: _c, apiKey: _k, ...rest } = o as Record<string, unknown>
    void _c
    void _k
    return rest
  }
  const m = (a.model ?? {}) as Record<string, unknown>
  return {
    voice: strip(a.voice),
    transcriber: strip(a.transcriber),
    model: {
      provider: typeof m.provider === 'string' ? m.provider : undefined,
      model: typeof m.model === 'string' ? m.model : undefined,
      temperature: typeof m.temperature === 'number' ? m.temperature : undefined,
      maxTokens: typeof m.maxTokens === 'number' ? m.maxTokens : undefined,
    },
  }
}
