/**
 * Email delivery — one place for the provider cascade:
 *   Gmail (connected + enabled in CRM Settings) → SendGrid (env) → SMTP (env).
 *
 * Used by the BullMQ worker (services/emailQueue.ts) and by request-time
 * transactional mail that must not depend on Redis (staff invites, password resets).
 *
 * HIPAA/GDPR: never log subject, body or recipient.
 */
import nodemailer from 'nodemailer'
import sgMail from '@sendgrid/mail'
import { prisma } from '@/lib/prisma'
import { getGmailAccessToken } from '@/lib/google/gmailToken'

// ─── Email providers ──────────────────────────────────────────────────────────

const hasSendGrid = !!process.env.SENDGRID_API_KEY
if (hasSendGrid) sgMail.setApiKey(process.env.SENDGRID_API_KEY!)

const smtpTransport = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   ?? 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT ?? '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
  },
})

export const FROM_ADDRESS = process.env.EMAIL_FROM ?? 'Clínica Dentária Nunes Monteiro <geral@clinicadentariaih.com>'

// ─── Gmail API send ───────────────────────────────────────────────────────────
// Builds an RFC 2822 multipart/alternative message and sends it via the Gmail API
// using the OAuth token connected in CRM Settings. Subjects/bodies are base64-encoded
// so non-ASCII content is preserved.

async function sendViaGmail(
  token:       string,
  senderEmail: string,
  fromName:    string | null,
  to:          string,
  subject:     string,
  html:        string,
  text:        string,
): Promise<void> {
  const fromHeader = fromName ? `${fromName} <${senderEmail}>` : senderEmail
  const boundary = `b_${Math.random().toString(36).slice(2)}`

  const raw = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text).toString('base64'),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html).toString('base64'),
    '',
    `--${boundary}--`,
  ].join('\r\n')

  const encoded = Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`gmail_send_failed:${res.status}:${errText.slice(0, 200)}`)
  }
}

// Returns sg_message_id when SendGrid is used (stored in metadata for webhook fallback matching)
// Provider priority: Gmail (if connected + enabled in Settings) → SendGrid (env) → SMTP (env).
export async function sendEmail(
  to:          string,
  subject:     string,
  html:        string,
  text:        string,
  emailLogId?: string,
): Promise<{ sgMessageId?: string; provider: string }> {
  // Prefer Gmail when an admin has connected + enabled it in CRM Settings
  const settings = await prisma.settings.findFirst().catch(() => null)
  if (settings?.gmailEnabled && settings.gmailAccessToken && settings.gmailRefreshToken) {
    const { token, senderEmail, error } = await getGmailAccessToken()
    if (!token || !senderEmail) throw new Error(`gmail_auth_failed:${error ?? 'unknown'}`)
    await sendViaGmail(token, senderEmail, settings.gmailFromName ?? null, to, subject, html, text)
    return { provider: 'gmail' }
  }

  if (hasSendGrid) {
    const msg: Parameters<typeof sgMail.send>[0] = {
      to, from: FROM_ADDRESS, subject, html, text,
    }
    // Attach email_log_id so the SendGrid webhook can match events back to this row
    if (emailLogId) {
      (msg as unknown as Record<string, unknown>).customArgs = { email_log_id: emailLogId }
    }
    const [response] = await sgMail.send(msg as sgMail.MailDataRequired)
    // Capture the SendGrid message ID for legacy fallback matching
    const sgMessageId = (response?.headers?.['x-message-id'] as string | undefined)?.split('.')[0]
    return { sgMessageId, provider: 'sendgrid' }
  }

  await smtpTransport.sendMail({ from: FROM_ADDRESS, to, subject, html, text })
  return { provider: 'smtp' }
}
