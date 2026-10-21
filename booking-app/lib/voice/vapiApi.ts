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

export type VapiConfig = { apiKey: string; assistantId: string | null; phoneNumberId: string | null; lastSync: Date | null }

/** Vapi connection from Settings, key decrypted. */
export async function getVapiConfig(): Promise<VapiConfig | null> {
  const s = await prisma.settings.findFirst({ select: { vapiApiKey: true, vapiAssistantId: true, vapiPhoneNumberId: true, vapiLastSync: true } })
  if (!s) return null
  return { apiKey: s.vapiApiKey ? decrypt(s.vapiApiKey) : '', assistantId: s.vapiAssistantId, phoneNumberId: s.vapiPhoneNumberId, lastSync: s.vapiLastSync }
}
