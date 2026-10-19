import { createHash, timingSafeEqual } from 'crypto'

/**
 * Verifies that a request to /api/webhooks/vapi really comes from Vapi.
 *
 * Vapi sends the server secret configured on the assistant either as the
 * `x-vapi-secret` header or as `Authorization: Bearer <secret>` (credential auth).
 *
 * Fails CLOSED: with no secret configured every request is refused (503), so a
 * missing env var can never turn the endpoint into an open door for writing
 * call logs, bookings or patient lookups. For local development only,
 * VAPI_ALLOW_UNSIGNED=true (ignored when NODE_ENV=production) disables the check.
 */

export type VerifyResult =
  | { ok: true; mode: 'signed' | 'unsigned-dev' }
  | { ok: false; status: 401 | 503; reason: 'secret_not_configured' | 'missing_credential' | 'bad_credential' }

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

/** Constant-time string comparison (hashing first makes lengths equal). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b))
}

export function extractCredential(headers: Headers): string | null {
  const direct = headers.get('x-vapi-secret')
  if (direct) return direct.trim()
  const authz = headers.get('authorization')
  if (authz && /^bearer\s+/i.test(authz)) return authz.replace(/^bearer\s+/i, '').trim()
  return null
}

export function verifyVapiRequest(headers: Headers, env: Record<string, string | undefined> = process.env): VerifyResult {
  const secret = env.VAPI_WEBHOOK_SECRET?.trim()
  if (!secret) {
    if (env.NODE_ENV !== 'production' && env.VAPI_ALLOW_UNSIGNED === 'true') {
      return { ok: true, mode: 'unsigned-dev' }
    }
    return { ok: false, status: 503, reason: 'secret_not_configured' }
  }
  const incoming = extractCredential(headers)
  if (!incoming) return { ok: false, status: 401, reason: 'missing_credential' }
  if (!safeEqual(incoming, secret)) return { ok: false, status: 401, reason: 'bad_credential' }
  return { ok: true, mode: 'signed' }
}
