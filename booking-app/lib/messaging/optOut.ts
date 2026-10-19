import prisma from '@/lib/prisma'
import { toE164 } from '@/lib/clinic/phone'

/**
 * Opt-outs are keyed by phone number, not by patient: a STOP must keep working
 * after the patient record is merged, archived, erased or re-imported.
 *
 * Rule: a number is opted out while ANY SMSOptOut row for it says so. Only a
 * START/INICIAR from that number (handleSmsOptKeyword) clears them.
 */
export function e164Variants(phones: (string | null | undefined)[]): string[] {
  const out = new Set<string>()
  for (const p of phones) {
    const e = toE164(p ?? null)
    if (e) out.add(e)
  }
  return [...out]
}

export async function isAnyNumberOptedOut(phones: (string | null | undefined)[]): Promise<boolean> {
  const numbers = e164Variants(phones)
  if (numbers.length === 0) return false
  const row = await prisma.sMSOptOut.findFirst({
    where: { phoneNumber: { in: numbers }, isOptedOut: true },
    select: { id: true },
  })
  return row !== null
}

/** Patient-level flag, patient rows, or an opt-out recorded against any of the patient's numbers. */
export async function isPatientOptedOutByAnyRoute(patientId: string, extraPhones: (string | null | undefined)[] = []): Promise<boolean> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { smsOptOut: true, phone: true, parentPhone: true, parentPhone2: true },
  })
  if (!patient) return true // unknown patient: never send
  if (patient.smsOptOut) return true
  const own = await prisma.sMSOptOut.findFirst({ where: { patientId, isOptedOut: true }, select: { id: true } })
  if (own) return true
  return isAnyNumberOptedOut([patient.phone, patient.parentPhone, patient.parentPhone2, ...extraPhones])
}

/** START from a number clears every opt-out recorded for it (any patient or none). */
export async function clearOptOutsForNumber(phoneE164: string): Promise<void> {
  await prisma.sMSOptOut.updateMany({
    where: { phoneNumber: phoneE164, isOptedOut: true },
    data: { isOptedOut: false, optedInAt: new Date() },
  })
}
