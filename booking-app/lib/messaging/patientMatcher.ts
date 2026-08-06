import prisma from '@/lib/prisma'
import { findPatientByPhone, normalizePhone } from '@/lib/messaging/portalAuth'

const WEBCHAT_PLACEHOLDER_DOB = new Date('1900-01-01T00:00:00.000Z')

export type WebChatPatientMatch = {
  patientId: string
  matched: boolean
}

/**
 * Resolve an existing patient by phone, or create a placeholder record
 * for staff to verify and merge later.
 */
export async function resolveWebChatPatient(
  visitorName: string,
  phone: string,
): Promise<WebChatPatientMatch> {
  const existing = await findPatientByPhone(phone)
  if (existing) {
    return { patientId: existing.id, matched: true }
  }

  const trimmed = visitorName.trim()
  const parts = trimmed.split(/\s+/)
  const firstName = parts[0] || 'Web'
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : 'Chat Visitor'

  const patient = await prisma.patient.create({
    data: {
      firstName,
      lastName,
      dateOfBirth: WEBCHAT_PLACEHOLDER_DOB,
      phone: normalizePhone(phone),
      parentName: trimmed,
      parentPhone: normalizePhone(phone),
      medicalNotes: 'Auto-created from web chat — verify identity and update patient record.',
      status: 'ACTIVE',
    },
  })

  return { patientId: patient.id, matched: false }
}
