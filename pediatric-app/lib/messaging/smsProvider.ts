/**
 * Twilio SMS provider — the only module that talks to Twilio directly.
 * HIPAA: never log SMS body or OTP codes; only log Twilio SIDs.
 */

import twilio from 'twilio'

export type TwilioMessagesApi = {
  create: (opts: { body: string; from: string; to: string }) => Promise<{ sid: string }>
}

export type TwilioClientLike = {
  messages: TwilioMessagesApi
}

let twilioClient: TwilioClientLike | null = null

function getAccountSid(): string {
  return process.env.TWILIO_ACCOUNT_SID ?? ''
}

function getAuthToken(): string {
  return process.env.TWILIO_AUTH_TOKEN ?? ''
}

export function getTwilioFromNumber(): string {
  return process.env.TWILIO_PHONE_NUMBER ?? ''
}

function getClient(): TwilioClientLike {
  if (!twilioClient) {
    const sid = getAccountSid()
    const token = getAuthToken()
    if (!sid || !token) {
      throw new Error('Twilio credentials are not configured')
    }
    twilioClient = twilio(sid, token) as unknown as TwilioClientLike
  }
  return twilioClient
}

/** @internal Test hook — inject a mock Twilio client */
export function setTwilioClientForTests(client: TwilioClientLike | null): void {
  twilioClient = client
}

/**
 * Normalize a phone number to E.164.
 * - Already has + prefix → keep country digits
 * - 10 digits → US (+1)
 * - 11 digits starting with 1 → US (+1…)
 * - Longer than 11 digits → international (+digits only)
 */
export function formatPhoneE164(phone: string): string {
  const trimmed = phone.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) {
    throw new Error('Invalid phone number')
  }

  if (trimmed.startsWith('+')) {
    return `+${digits}`
  }

  if (digits.length === 10) {
    return `+1${digits}`
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }

  if (digits.length > 11) {
    return `+${digits}`
  }

  // 11-digit numbers not starting with 1 (e.g. some country codes without +)
  if (digits.length === 11) {
    return `+${digits}`
  }

  throw new Error('Invalid phone number')
}

function resolveWebhookUrl(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https'
  const pathname = new URL(request.url).pathname

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}${pathname}`
  }

  const publicBase = process.env.NEXTAUTH_URL
  if (publicBase) {
    return `${publicBase.replace(/\/$/, '')}${pathname}`
  }

  return request.url
}

/**
 * Validate Twilio inbound webhook signature (prevents spoofed requests).
 * Consumes the request body — clone the request if you need to read form data again.
 */
export async function validateWebhookSignature(request: Request): Promise<boolean> {
  const authToken = getAuthToken()
  if (!authToken) {
    console.error('[sms] TWILIO_AUTH_TOKEN not configured')
    return false
  }

  const signature = request.headers.get('x-twilio-signature') ?? ''
  const formData = await request.formData()
  const params = Object.fromEntries(formData.entries()) as Record<string, string>
  const url = resolveWebhookUrl(request)

  return twilio.validateRequest(authToken, signature, url, params)
}

export async function sendSMS({
  to,
  body,
  client,
}: {
  to: string
  body: string
  client?: TwilioClientLike
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const from = getTwilioFromNumber()
  if (!from) {
    return { success: false, error: 'TWILIO_PHONE_NUMBER is not configured' }
  }

  let normalizedTo: string
  try {
    normalizedTo = formatPhoneE164(to)
  } catch {
    return { success: false, error: 'Invalid recipient phone number' }
  }

  try {
    const twilioApi = client ?? getClient()
    const message = await twilioApi.messages.create({
      body,
      from,
      to: normalizedTo,
    })
    return { success: true, messageId: message.sid }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SMS send failed'
    return { success: false, error: message }
  }
}

/** Mask phone for settings display: +1253XXXXXXX */
export function maskPhoneForDisplay(phone: string): string {
  try {
    const e164 = formatPhoneE164(phone)
    if (e164.length <= 6) return e164
    const visiblePrefix = e164.slice(0, 5)
    const visibleSuffix = e164.slice(-4)
    const maskedLen = Math.max(0, e164.length - visiblePrefix.length - visibleSuffix.length)
    return `${visiblePrefix}${'X'.repeat(maskedLen)}${visibleSuffix}`
  } catch {
    return 'Not configured'
  }
}
