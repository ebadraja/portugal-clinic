/**
 * STOP / START keywords from inbound SMS (Twilio → /api/webhooks/twilio).
 * Opt-outs are keyed by number and also stored on the patient, so they outlive both
 * the record and a change of number (see lib/sms/optOut.ts).
 */
import prisma from '@/lib/prisma'
import { clearOptOutsForNumber } from '@/lib/sms/optOut'
import { findPatientIdByPhone } from '@/lib/voice/endOfCall'

export type SmsOptKeyword = 'stop' | 'start'

// English carrier keywords + Portuguese equivalents (PARAR / SAIR; INICIAR to resume).
const STOP_KEYWORDS = new Set(['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'PARAR', 'SAIR'])
const START_KEYWORDS = new Set(['START', 'SUBSCRIBE', 'UNSTOP', 'INICIAR'])

export function classifySmsKeyword(body: string): SmsOptKeyword | null {
  const normalized = body.trim().toUpperCase()
  if (STOP_KEYWORDS.has(normalized)) return 'stop'
  if (START_KEYWORDS.has(normalized)) return 'start'
  return null
}

/** Records STOP / START for the number, and for the patient when the number belongs to exactly one. */
export async function handleSmsOptKeyword(phoneE164: string, keyword: SmsOptKeyword): Promise<void> {
  // A shared family number matches nobody: the opt-out is then kept on the number alone.
  const patientId = await findPatientIdByPhone(phoneE164)
  const data =
    keyword === 'stop'
      ? { isOptedOut: true, optedOutAt: new Date(), optedInAt: null }
      : { isOptedOut: false, optedInAt: new Date() }

  const existing = await prisma.sMSOptOut.findFirst({ where: { patientId, phoneNumber: phoneE164 }, select: { id: true } })
  if (existing) {
    await prisma.sMSOptOut.update({ where: { id: existing.id }, data })
  } else {
    await prisma.sMSOptOut.create({ data: { patientId, phoneNumber: phoneE164, ...data } })
  }
  if (keyword === 'start') await clearOptOutsForNumber(phoneE164)
  if (patientId) await prisma.patient.update({ where: { id: patientId }, data: { smsOptOut: keyword === 'stop' } })
  console.log(`[sms-webhook] ${keyword} recorded${patientId ? '' : ' for unmatched number'}`)
}
