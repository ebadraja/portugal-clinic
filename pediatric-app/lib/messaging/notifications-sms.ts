import prisma from '@/lib/prisma'
import {
  findPatientByPhone,
  createMagicLinkSession,
  hasPendingOtpSession,
} from '@/lib/messaging/portalAuth'
import { formatPhoneE164 } from '@/lib/messaging/smsProvider'
import { getSmsProviderConfig } from '@/lib/messaging/smsSettings'
import { queueSms } from '@/services/messageQueue'

const ACTIVE_SESSION_MS = 5 * 60 * 1000

function resolvePortalSiteBase(portalConfig: { baseUrl?: string } | null): string {
  let base =
    portalConfig?.baseUrl?.replace(/\/$/, '') ??
    process.env.NEXTAUTH_URL?.replace(/\/$/, '') ??
    'https://app.kids0218.com'

  // portalConfig.baseUrl may already end with /portal — avoid /portal/portal/chat/…
  base = base.replace(/\/portal$/, '')
  return base
}

async function getPortalBaseUrl(): Promise<string> {
  const settings = await prisma.settings.findFirst({
    select: { portalConfig: true },
  })
  return resolvePortalSiteBase((settings?.portalConfig ?? {}) as { baseUrl?: string })
}

async function isPatientActiveInPortal(patientId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - ACTIVE_SESSION_MS)
  const session = await prisma.patientPortalSession.findFirst({
    where: {
      patientId,
      verifiedAt: { not: null, gte: cutoff },
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  })
  return session !== null
}

/**
 * Positive consent gate for marketing/notification SMS.
 *
 * Returns true only when the patient has affirmatively opted in (an SMSOptOut
 * row with isOptedOut=false) and has not globally opted out. Patients who never
 * granted consent (e.g. skipped the portal consent checkbox) are treated as not
 * consented and will not receive notification SMS. OTP codes are transactional
 * and are NOT gated by this check.
 */
export async function hasSmsConsent(patientId: string): Promise<boolean> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { smsOptOut: true },
  })
  if (patient?.smsOptOut) return false

  const optIn = await prisma.sMSOptOut.findFirst({
    where: {
      patientId,
      isOptedOut: false,
    },
    select: { id: true },
  })
  return optIn !== null
}

/**
 * Record affirmative SMS consent for a patient (e.g. portal consent checkbox).
 * Creates or updates the SMSOptOut record as opted-in and clears any global
 * opt-out flag. Safe to call repeatedly.
 */
export async function recordSmsConsent(patientId: string, phone: string): Promise<void> {
  let phoneNumber = phone
  try {
    phoneNumber = formatPhoneE164(phone)
  } catch {
    // Store the raw phone if it can't be normalized; consent is still recorded.
  }

  const existing = await prisma.sMSOptOut.findFirst({
    where: { patientId, phoneNumber },
    select: { id: true },
  })

  if (existing) {
    await prisma.sMSOptOut.update({
      where: { id: existing.id },
      data: { isOptedOut: false, optedInAt: new Date() },
    })
  } else {
    await prisma.sMSOptOut.create({
      data: { patientId, phoneNumber, isOptedOut: false, optedInAt: new Date() },
    })
  }

  await prisma.patient.update({
    where: { id: patientId },
    data: { smsOptOut: false },
  })
}

/**
 * Most recent portal-verified phone for this patient (OTP + DOB completed).
 * Returns null when no active verified session exists — no consented SMS destination.
 */
async function getVerifiedPortalPhone(patientId: string): Promise<string | null> {
  const session = await prisma.patientPortalSession.findFirst({
    where: {
      patientId,
      verifiedAt: { not: null },
      expiresAt: { gt: new Date() },
    },
    orderBy: { verifiedAt: 'desc' },
    select: { phoneNumber: true },
  })

  return session?.phoneNumber ?? null
}

/**
 * Send a generic SMS notification when staff replies (no PHI in body).
 * Never queues OTP — only the "new message" notification with a magic link.
 * SMS goes only to a portal-verified parent/guardian phone (PatientPortalSession).
 */
export async function notifyPatientOfNewMessage({
  patientId,
  conversationId,
}: {
  patientId: string
  conversationId: string
  staffName?: string
}): Promise<void> {
  const config = await getSmsProviderConfig()
  if (!config.sendNotificationOnStaffReply) {
    return
  }

  // Only notify patients who affirmatively consented to SMS. STOP/opt-out
  // clears consent; OTP codes are unaffected (transactional).
  if (!(await hasSmsConsent(patientId))) {
    return
  }

  if (await isPatientActiveInPortal(patientId)) {
    return
  }

  // Patient mid OTP login — don't send a second SMS (avoids OTP + notification overlap)
  if (await hasPendingOtpSession(patientId)) {
    return
  }

  const verifiedPhone = await getVerifiedPortalPhone(patientId)
  if (!verifiedPhone) {
    return
  }

  let phoneE164: string
  try {
    phoneE164 = formatPhoneE164(verifiedPhone)
  } catch {
    console.error(`[sms] invalid verified portal phone patientId=${patientId}`)
    return
  }

  const rawToken = await createMagicLinkSession(patientId, phoneE164)
  const portalBase = await getPortalBaseUrl()
  const link = `${portalBase}/portal/chat/${rawToken}`

  const smsBody =
    `You have a new message from Kids 0-18 Pediatrics. Read it here: ${link}`

  await queueSms({
    to: phoneE164,
    body: smsBody,
    type: 'notification',
    patientId,
    conversationId,
  })
}

export type SmsOptKeyword = 'stop' | 'start'

const STOP_KEYWORDS = new Set(['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'])
const START_KEYWORDS = new Set(['START', 'SUBSCRIBE', 'UNSTOP'])

export function classifySmsKeyword(body: string): SmsOptKeyword | null {
  const normalized = body.trim().toUpperCase()
  if (STOP_KEYWORDS.has(normalized)) return 'stop'
  if (START_KEYWORDS.has(normalized)) return 'start'
  return null
}

/**
 * Handle STOP/START opt-out keywords from inbound Twilio SMS.
 */
export async function handleSmsOptKeyword(
  phoneE164: string,
  keyword: SmsOptKeyword,
): Promise<void> {
  const patient = await findPatientByPhone(phoneE164)
  if (!patient) {
    console.log(`[sms-webhook] ${keyword} from unknown phone (no patient match)`)
    return
  }

  if (keyword === 'stop') {
    const existing = await prisma.sMSOptOut.findFirst({
      where: { patientId: patient.id, phoneNumber: phoneE164 },
    })

    if (existing) {
      await prisma.sMSOptOut.update({
        where: { id: existing.id },
        data: {
          isOptedOut: true,
          optedOutAt: new Date(),
          optedInAt: null,
        },
      })
    } else {
      await prisma.sMSOptOut.create({
        data: {
          patientId: patient.id,
          phoneNumber: phoneE164,
          isOptedOut: true,
          optedOutAt: new Date(),
        },
      })
    }

    await prisma.patient.update({
      where: { id: patient.id },
      data: { smsOptOut: true },
    })
    return
  }

  const existing = await prisma.sMSOptOut.findFirst({
    where: { patientId: patient.id, phoneNumber: phoneE164 },
  })

  if (existing) {
    await prisma.sMSOptOut.update({
      where: { id: existing.id },
      data: {
        isOptedOut: false,
        optedInAt: new Date(),
      },
    })
  } else {
    await prisma.sMSOptOut.create({
      data: {
        patientId: patient.id,
        phoneNumber: phoneE164,
        isOptedOut: false,
        optedInAt: new Date(),
        optedOutAt: new Date(),
      },
    })
  }

  await prisma.patient.update({
    where: { id: patient.id },
    data: { smsOptOut: false },
  })
}
