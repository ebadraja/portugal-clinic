import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email/send'
import { TOKEN_TTL_HOURS, type TokenPurpose } from '@/lib/auth/passwordTokens'

/** Is any outbound email route configured? (Gmail connected, SendGrid key, or SMTP credentials.) */
export async function emailDeliveryConfigured(): Promise<boolean> {
  if (process.env.SENDGRID_API_KEY) return true
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return true
  const s = await prisma.settings.findFirst({ select: { gmailEnabled: true, gmailRefreshToken: true } }).catch(() => null)
  return !!(s?.gmailEnabled && s.gmailRefreshToken)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Sends the set-password link. Returns false (never throws) when delivery fails. */
export async function sendPasswordLinkEmail(input: { to: string; firstName: string; url: string; purpose: TokenPurpose }): Promise<boolean> {
  const settings = await prisma.settings.findFirst({ select: { practiceName: true } }).catch(() => null)
  const clinic = settings?.practiceName ?? 'Clínica Dentária Nunes Monteiro'
  const hours = TOKEN_TTL_HOURS[input.purpose]
  const invite = input.purpose === 'invite'
  const subject = invite ? `Convite para o CRM — ${clinic}` : `Redefinir a palavra-passe — ${clinic}`
  const intro = invite
    ? `Foi convidado(a) para o CRM da ${clinic}. Defina a sua palavra-passe através da ligação abaixo.`
    : 'Recebemos um pedido para redefinir a sua palavra-passe. Se não foi você, ignore este email.'
  const text = `Olá ${input.firstName},\n\n${intro}\n\n${input.url}\n\nA ligação é válida durante ${hours} horas e só pode ser usada uma vez.\n\n${clinic}`
  const html = `<p>Olá ${escapeHtml(input.firstName)},</p><p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(input.url)}">${invite ? 'Definir palavra-passe' : 'Redefinir palavra-passe'}</a></p><p style="color:#64748b;font-size:13px">A ligação é válida durante ${hours} horas e só pode ser usada uma vez.</p><p>${escapeHtml(clinic)}</p>`
  try {
    await sendEmail(input.to, subject, html, text)
    return true
  } catch (err) {
    console.error('[password-email] delivery failed:', (err as Error).message.slice(0, 120))
    return false
  }
}
