/**
 * Email alerts to the clinic inbox for things the voice agent did while
 * nobody was watching the CRM. Controlled by Settings → Notifications
 * (notificationEmail + one switch per kind). Fire-and-forget.
 *
 * Data minimisation: first name and time only — never DOB, phone or clinical detail.
 */
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email/send'

export type StaffEmailKind = 'newBooking' | 'cancellation' | 'escalation' | 'newPatient'

const FLAG: Record<StaffEmailKind, 'emailNewBooking' | 'emailCancellation' | 'emailEscalation' | 'emailNewPatient'> = {
  newBooking: 'emailNewBooking',
  cancellation: 'emailCancellation',
  escalation: 'emailEscalation',
  newPatient: 'emailNewPatient',
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export async function emailStaffAlert(kind: StaffEmailKind, subject: string, lines: string[]): Promise<boolean> {
  try {
    const s = await prisma.settings.findFirst({
      select: { notificationEmail: true, emailEnabled: true, emailNewBooking: true, emailCancellation: true, emailEscalation: true, emailNewPatient: true, practiceName: true },
    })
    if (!s?.notificationEmail || !s.emailEnabled || !s[FLAG[kind]]) return false
    const text = `${lines.join('\n')}\n\n— CRM ${s.practiceName}`
    const html = `${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}<p style="color:#64748b;font-size:12px">CRM ${escapeHtml(s.practiceName)}</p>`
    await sendEmail(s.notificationEmail, subject, html, text)
    return true
  } catch (err) {
    console.error(`[staff-email] ${kind} failed:`, (err as Error).message.slice(0, 120))
    return false
  }
}
