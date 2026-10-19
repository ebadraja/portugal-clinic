/**
 * Session security policy (Settings → Security & Audit):
 *   - sessionTimeout: minutes of inactivity before a staff session ends
 *   - twoFactorRequired: administrators must use two-factor sign-in
 *
 * Read on every session check (auth.ts jwt callback), so it is cached per
 * server instance for a minute. A missing or unreadable value fails safe
 * (30-minute timeout).
 */
import prisma from '@/lib/prisma'

export type SessionPolicy = { idleMinutes: number; requireAdmin2fa: boolean }

export const DEFAULT_SESSION_POLICY: SessionPolicy = { idleMinutes: 30, requireAdmin2fa: false }
export const ALLOWED_IDLE_MINUTES = [15, 30, 60, 120, 240] as const
/** Absolute lifetime of any session, regardless of activity. */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60

const TTL_MS = 60_000
let cache: { value: SessionPolicy; at: number } | null = null

export function normaliseIdleMinutes(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SESSION_POLICY.idleMinutes
  return Math.min(240, Math.max(5, Math.round(n)))
}

export async function getSessionPolicy(now = Date.now()): Promise<SessionPolicy> {
  if (cache && now - cache.at < TTL_MS) return cache.value
  try {
    const s = await prisma.settings.findFirst({ select: { sessionTimeout: true, twoFactorRequired: true } })
    const value = { idleMinutes: normaliseIdleMinutes(s?.sessionTimeout), requireAdmin2fa: s?.twoFactorRequired ?? false }
    cache = { value, at: now }
    return value
  } catch {
    return cache?.value ?? DEFAULT_SESSION_POLICY
  }
}

export function clearSessionPolicyCache(): void {
  cache = null
}

/** Pure: is this session past its idle limit? */
export function isIdleExpired(lastActivity: number | undefined, idleMinutes: number, now = Date.now()): boolean {
  if (!lastActivity) return false
  return now - lastActivity > idleMinutes * 60_000
}

/** Pure: must this user enrol in two-factor before using the CRM? */
export function mustEnrollTwoFactor(role: string | undefined, twoFactorEnabled: boolean | undefined, policy: SessionPolicy): boolean {
  return policy.requireAdmin2fa && role === 'ADMIN' && !twoFactorEnabled
}
