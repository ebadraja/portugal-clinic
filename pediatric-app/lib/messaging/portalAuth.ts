import { createHash, randomBytes, randomInt } from 'crypto'
import { cookies } from 'next/headers'
import prisma from '@/lib/prisma'

export const PORTAL_COOKIE_NAME = 'portal_session'
const SESSION_MS = 30 * 24 * 60 * 60 * 1000
const PENDING_MS = 15 * 60 * 1000

function portalSecret(): string {
  return process.env.PORTAL_SECRET || process.env.ENCRYPTION_SECRET || 'default-secret-key'
}

export function hashPortalToken(raw: string): string {
  return createHash('sha256').update(`${raw}:${portalSecret()}`).digest('hex')
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhone(a)
  const nb = normalizePhone(b)
  if (!na || !nb) return false
  if (na === nb) return true
  // Match last 10 digits (US)
  return na.slice(-10) === nb.slice(-10)
}

export function generateRawToken(): string {
  return randomBytes(32).toString('hex')
}

export function generateSmsCode(): string {
  return String(randomInt(100000, 999999))
}

export function hashSmsCode(code: string): string {
  return createHash('sha256').update(`${code}:${portalSecret()}`).digest('hex')
}

export function isSameDateOfBirth(dob: Date, input: string): boolean {
  const parsed = new Date(input)
  if (isNaN(parsed.getTime())) return false
  return (
    dob.getUTCFullYear() === parsed.getUTCFullYear() &&
    dob.getUTCMonth() === parsed.getUTCMonth() &&
    dob.getUTCDate() === parsed.getUTCDate()
  )
}

export async function findPatientByPhone(phone: string) {
  const digits = normalizePhone(phone)
  if (digits.length < 10) return null

  const patients = await prisma.patient.findMany({
    where: { phone: { not: null } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      phone: true,
      parentPhone: true,
    },
  })

  return (
    patients.find(
      (p) =>
        (p.phone && phonesMatch(p.phone, digits)) ||
        (p.parentPhone && phonesMatch(p.parentPhone, digits)),
    ) ?? null
  )
}

type PendingMeta = {
  step: 'awaiting_code' | 'awaiting_dob' | 'magic_link'
  smsCodeHash?: string
}

export function parsePendingMeta(deviceFingerprint: string | null): PendingMeta | null {
  if (!deviceFingerprint) return null
  try {
    return JSON.parse(deviceFingerprint) as PendingMeta
  } catch {
    return null
  }
}

export async function createPendingPortalSession(patientId: string, phoneNumber: string) {
  const rawToken = generateRawToken()
  const session = await prisma.patientPortalSession.create({
    data: {
      patientId,
      phoneNumber: normalizePhone(phoneNumber),
      token: hashPortalToken(rawToken),
      expiresAt: new Date(Date.now() + PENDING_MS),
      deviceFingerprint: JSON.stringify({ step: 'awaiting_code' as const }),
    },
  })
  return { rawToken, sessionId: session.id }
}

export async function attachSmsCodeToSession(sessionId: string, code: string) {
  const meta: PendingMeta = { step: 'awaiting_code', smsCodeHash: hashSmsCode(code) }
  await prisma.patientPortalSession.update({
    where: { id: sessionId },
    data: { deviceFingerprint: JSON.stringify(meta) },
  })
}

export async function verifySmsCodeForSession(sessionId: string, code: string): Promise<boolean> {
  const session = await prisma.patientPortalSession.findUnique({ where: { id: sessionId } })
  if (!session || session.expiresAt < new Date()) return false
  const meta = parsePendingMeta(session.deviceFingerprint)
  if (!meta?.smsCodeHash) return false
  return meta.smsCodeHash === hashSmsCode(code)
}

export async function advanceSessionToDobStep(sessionId: string) {
  const meta: PendingMeta = { step: 'awaiting_dob' }
  await prisma.patientPortalSession.update({
    where: { id: sessionId },
    data: { deviceFingerprint: JSON.stringify(meta) },
  })
}

export async function completePortalVerification(sessionId: string) {
  const session = await prisma.patientPortalSession.update({
    where: { id: sessionId },
    data: {
      verifiedAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_MS),
      deviceFingerprint: null,
    },
  })
  return session
}

export async function getPortalSessionByRawToken(rawToken: string) {
  const hashed = hashPortalToken(rawToken)
  const session = await prisma.patientPortalSession.findUnique({
    where: { token: hashed },
    include: {
      patient: {
        select: { id: true, firstName: true, lastName: true, dateOfBirth: true },
      },
    },
  })
  if (!session || session.expiresAt < new Date()) return null
  return session
}

export async function createMagicLinkSession(patientId: string, phoneNumber: string) {
  const rawToken = generateRawToken()
  await prisma.patientPortalSession.create({
    data: {
      patientId,
      phoneNumber: normalizePhone(phoneNumber),
      token: hashPortalToken(rawToken),
      expiresAt: new Date(Date.now() + SESSION_MS),
      deviceFingerprint: JSON.stringify({ step: 'magic_link' as const }),
    },
  })
  return rawToken
}

/** True when patient is mid OTP login (code sent, not yet verified). */
export async function hasPendingOtpSession(patientId: string): Promise<boolean> {
  const sessions = await prisma.patientPortalSession.findMany({
    where: {
      patientId,
      verifiedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { deviceFingerprint: true },
    take: 10,
  })

  return sessions.some((s) => parsePendingMeta(s.deviceFingerprint)?.step === 'awaiting_code')
}

export async function setPortalSessionCookie(rawToken: string) {
  const cookieStore = await cookies()
  cookieStore.set(PORTAL_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  })
}

export async function clearPortalSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(PORTAL_COOKIE_NAME)
}

export async function getPortalSessionFromCookies() {
  const cookieStore = await cookies()
  const raw = cookieStore.get(PORTAL_COOKIE_NAME)?.value
  if (!raw) return null
  const session = await getPortalSessionByRawToken(raw)
  if (!session?.verifiedAt) return null
  return session
}

export async function getOrCreatePatientConversation(patientId: string, reason?: string) {
  const existing = await prisma.conversation.findUnique({ where: { patientId } })
  if (existing) return existing

  const { resolveInboxForReason } = await import('@/lib/messaging/router')
  const assignedInboxId = reason
    ? await resolveInboxForReason(reason as import('@/lib/generated/prisma/client').MessageReason)
    : null

  return prisma.conversation.create({
    data: {
      patientId,
      reason: reason as import('@/lib/generated/prisma/client').MessageReason | undefined,
      assignedInboxId,
      status: 'OPEN',
    },
  })
}
