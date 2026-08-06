import { createHmac, randomUUID, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

export const WEBCHAT_COOKIE_NAME = 'webchat_session'
const COOKIE_MAX_AGE = 24 * 60 * 60

function webchatSecret(): string {
  return process.env.PORTAL_SECRET || process.env.ENCRYPTION_SECRET || 'default-secret-key'
}

function signPayload(payload: string): string {
  return createHmac('sha256', webchatSecret()).update(payload).digest('hex')
}

export function createWebchatSessionToken(conversationId: string, phone: string): string {
  const payload = `${conversationId}:${phone.replace(/\D/g, '')}`
  return `${Buffer.from(payload).toString('base64url')}.${signPayload(payload)}`
}

export function parseWebchatSessionToken(
  token: string,
): { conversationId: string; phone: string } | null {
  const [encoded, sig] = token.split('.')
  if (!encoded || !sig) return null

  let payload: string
  try {
    payload = Buffer.from(encoded, 'base64url').toString('utf8')
  } catch {
    return null
  }

  const expected = signPayload(payload)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }

  const [conversationId, phone] = payload.split(':')
  if (!conversationId || !phone) return null
  return { conversationId, phone }
}

export async function setWebchatSessionCookie(conversationId: string, phone: string) {
  const token = createWebchatSessionToken(conversationId, phone)
  const cookieStore = await cookies()
  cookieStore.set(WEBCHAT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })
  return token
}

export async function getWebchatSessionFromCookies() {
  const cookieStore = await cookies()
  const raw = cookieStore.get(WEBCHAT_COOKIE_NAME)?.value
  if (!raw) return null
  return parseWebchatSessionToken(raw)
}

/** Cookie first; fall back to signed `sessionToken` query param for widget polling. */
export async function resolveWebchatSession(request: NextRequest) {
  const fromCookie = await getWebchatSessionFromCookies()
  if (fromCookie) return fromCookie

  const token = request.nextUrl.searchParams.get('sessionToken')
  if (token) return parseWebchatSessionToken(token)

  return null
}

export function newClientSessionId(): string {
  return randomUUID()
}
