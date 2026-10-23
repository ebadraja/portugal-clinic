/**
 * GDPR (RGPD) data-subject rights for patients.
 *
 *  - Access / portability (art. 15, 20): exportPatientData() — everything the
 *    CRM holds on one patient, decrypted, as JSON.
 *  - Erasure (art. 17): erasePatient() — hard-deletes the patient and every
 *    record that holds their personal data, in one transaction. Kept on purpose:
 *      * SMS opt-outs (detached, keyed by phone number) so a STOP keeps working;
 *      * the audit trail (ids and actions only) plus one tombstone entry.
 *    Clinical-record retention duties may override erasure — the admin confirms
 *    the legal basis in the request reason; the CRM does not decide it.
 */
import prisma from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'

// Messaging and intake forms were removed from the CRM (23 Oct 2026), but rows written before
// that stay in the database, so export and erasure still cover them.

/** Storage key of a (legacy) message attachment, if the message had one. */
function attachmentKey(metadata: unknown): string | null {
  const key = (metadata as { storageKey?: unknown } | null)?.storageKey
  return typeof key === 'string' && key ? key : null
}

function safeDecrypt(v: string | null | undefined): string | null {
  if (!v) return null
  try {
    return decrypt(v)
  } catch {
    return null
  }
}

export async function exportPatientData(patientId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      appointments: { orderBy: { startTime: 'asc' } },
      notes: { orderBy: { createdAt: 'asc' }, include: { author: { select: { firstName: true, lastName: true } } } },
      documents: { orderBy: { createdAt: 'asc' } },
      callLogs: { orderBy: { startTime: 'asc' } },
      chatLogs: { orderBy: { startTime: 'asc' } },
      intakeForms: { include: { fieldValues: true } },
      emailLogs: { orderBy: { createdAt: 'asc' } },
      unsubscribe: true,
      smsOptOuts: true,
      portalSessions: { select: { id: true, phoneNumber: true, verifiedAt: true, createdAt: true, expiresAt: true } },
      callbackRequests: true,
      conversation: {
        include: { messages: { orderBy: { createdAt: 'asc' }, include: { sender: { select: { id: true, firstName: true, lastName: true } } } } },
      },
    },
  })
  if (!patient) return null

  const { conversation, callLogs, unsubscribe, emailLogs, ...rest } = patient
  return {
    exportedAt: new Date().toISOString(),
    format: 'clinic-crm-patient-export/v1',
    patient: rest,
    callLogs: callLogs.map(({ recordingUrl, ...c }) => ({ ...c, hasRecording: !!recordingUrl })),
    emailLogs: emailLogs.map((e) => ({ ...e, toEmail: safeDecrypt((e as { toEmail?: string }).toEmail) ?? undefined })),
    emailUnsubscribe: unsubscribe ? { ...unsubscribe, email: safeDecrypt(unsubscribe.email) } : null,
    messages: conversation
      ? conversation.messages
          .filter((m) => !m.isInternalNote)
          .map((m) => ({
            id: m.id,
            senderType: m.senderType,
            senderName: m.sender ? `${m.sender.firstName} ${m.sender.lastName}`.trim() : null,
            channel: m.channel,
            content: safeDecrypt(m.content),
            contentType: m.contentType,
            metadata: m.metadata,
            createdAt: m.createdAt,
          }))
      : [],
  }
}

export type EraseResult = {
  deleted: Record<string, number>
  filesDeleted: number
  filesFailed: string[]
  documentsNeedingManualRemoval: number
}

export async function erasePatient(patientId: string, actorId: string, reason: string): Promise<EraseResult | null> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: {
      id: true,
      conversation: { select: { messages: { select: { metadata: true } } } },
      _count: { select: { documents: true } },
    },
  })
  if (!patient) return null

  const storageKeys = (patient.conversation?.messages ?? [])
    .map((m) => attachmentKey(m.metadata))
    .filter((k): k is string => !!k)

  const deleted = await prisma.$transaction(async (tx) => {
    // Records whose relation would otherwise be set to NULL (keeping the personal data) or block the delete.
    const callLogs = await tx.callLog.deleteMany({ where: { patientId } })
    const chatLogs = await tx.chatLog.deleteMany({ where: { patientId } })
    const intakeForms = await tx.intakeForm.deleteMany({ where: { patientId } })
    const emailLogs = await tx.emailLog.deleteMany({ where: { patientId } })
    const callbacks = await tx.callbackRequest.deleteMany({ where: { patientId } })
    // Appointments, notes, documents, conversation + messages, portal sessions and the
    // email unsubscribe row cascade with the patient. SMS opt-outs are detached (SET NULL) and kept.
    await tx.patient.delete({ where: { id: patientId } })
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: 'DELETE',
        entity: 'patient',
        entityId: patientId,
        changes: { gdprErasure: true, reason: reason.slice(0, 500), removed: { callLogs: callLogs.count, chatLogs: chatLogs.count, intakeForms: intakeForms.count, emailLogs: emailLogs.count, callbacks: callbacks.count } },
        timestamp: new Date(),
      },
    })
    return { callLogs: callLogs.count, chatLogs: chatLogs.count, intakeForms: intakeForms.count, emailLogs: emailLogs.count, callbacks: callbacks.count }
  })

  // Legacy message attachments lived in the old Supabase storage, which the CRM no longer reaches:
  // report their keys so they can be removed by hand (none were created after the move to Neon).
  const filesDeleted = 0
  const filesFailed = storageKeys

  return { deleted, filesDeleted, filesFailed, documentsNeedingManualRemoval: patient._count.documents }
}
