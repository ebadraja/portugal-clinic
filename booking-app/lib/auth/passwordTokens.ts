/**
 * One-time password links for staff — invites and resets.
 *
 * Replaces the shared default password ("Kid0-18CRM") that every invited or // stub-ok: history
 * reset account used to get. Only a SHA-256 hash of the token is stored; the
 * raw token exists in the emailed link (and is shown once to the admin when
 * email is not configured). Setting a password consumes the token.
 *
 * Works without touching auth.ts / proxy.ts: the link points at /login (public)
 * and the APIs live under /api/auth/* (public in proxy.ts).
 */
import { createHash, randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import prisma from '@/lib/prisma'

export type TokenPurpose = 'invite' | 'reset'

export const TOKEN_TTL_HOURS: Record<TokenPurpose, number> = { invite: 72, reset: 2 }

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

export function generateRawToken(): string {
  return randomBytes(32).toString('base64url')
}

/** A random hash nobody knows the password for — invited accounts can't be logged into until the link is used. */
export async function unusablePasswordHash(): Promise<string> {
  return bcrypt.hash(randomBytes(32).toString('hex'), 12)
}

const COMMON = new Set(['password', 'password1', '12345678', '123456789', 'qwerty123', 'kid0-18crm', 'clinica123', 'admin123'])

/** Returns an error message, or null when acceptable. */
export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== 'string') return 'Password is required.'
  if (pw.length < 10) return 'Use at least 10 characters.'
  if (pw.length > 200) return 'Password is too long.'
  if (/^(.)\1+$/.test(pw)) return 'Password is too simple.'
  if (COMMON.has(pw.toLowerCase())) return 'That password is too common.'
  if (!/[a-zA-Z]/.test(pw) || !/[0-9\W_]/.test(pw)) return 'Mix letters with numbers or symbols.'
  return null
}

export function appBaseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

export function setPasswordUrl(rawToken: string): string {
  return `${appBaseUrl()}/login?token=${encodeURIComponent(rawToken)}`
}

export async function issuePasswordToken(userId: string, purpose: TokenPurpose, now = new Date()): Promise<{ rawToken: string; url: string; expiresAt: Date }> {
  const rawToken = generateRawToken()
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_HOURS[purpose] * 3_600_000)
  await prisma.user.update({
    where: { id: userId },
    data: { passwordTokenHash: hashToken(rawToken), passwordTokenExpiresAt: expiresAt, passwordTokenPurpose: purpose },
  })
  return { rawToken, url: setPasswordUrl(rawToken), expiresAt }
}

export type TokenLookup =
  | { ok: true; user: { id: string; email: string; firstName: string; purpose: TokenPurpose } }
  | { ok: false; reason: 'invalid' | 'expired' }

export async function lookupPasswordToken(rawToken: unknown, now = new Date()): Promise<TokenLookup> {
  if (typeof rawToken !== 'string' || rawToken.length < 20 || rawToken.length > 200) return { ok: false, reason: 'invalid' }
  const user = await prisma.user.findFirst({
    where: { passwordTokenHash: hashToken(rawToken) },
    select: { id: true, email: true, firstName: true, passwordTokenExpiresAt: true, passwordTokenPurpose: true },
  })
  if (!user) return { ok: false, reason: 'invalid' }
  if (!user.passwordTokenExpiresAt || user.passwordTokenExpiresAt <= now) return { ok: false, reason: 'expired' }
  return { ok: true, user: { id: user.id, email: user.email, firstName: user.firstName, purpose: (user.passwordTokenPurpose as TokenPurpose) ?? 'reset' } }
}

/** Sets the password and burns the token in one conditional update (a token works once). */
export async function consumePasswordToken(rawToken: string, newPassword: string, now = new Date()): Promise<{ ok: true; userId: string; purpose: TokenPurpose } | { ok: false; reason: 'invalid' | 'expired' | 'weak'; message?: string }> {
  const problem = passwordProblem(newPassword)
  if (problem) return { ok: false, reason: 'weak', message: problem }
  const found = await lookupPasswordToken(rawToken, now)
  if (!found.ok) return found
  const passwordHash = await bcrypt.hash(newPassword, 12)
  const res = await prisma.user.updateMany({
    where: { id: found.user.id, passwordTokenHash: hashToken(rawToken), passwordTokenExpiresAt: { gt: now } },
    data: { passwordHash, passwordTokenHash: null, passwordTokenExpiresAt: null, passwordTokenPurpose: null },
  })
  if (res.count !== 1) return { ok: false, reason: 'invalid' }
  return { ok: true, userId: found.user.id, purpose: found.user.purpose }
}
