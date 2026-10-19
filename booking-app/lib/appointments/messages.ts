/**
 * What patients read: SMS and email text for appointment messages, the "add to calendar"
 * links and the .ics file. Pure — no database access.
 *
 * GDPR: messages carry date, time, dentist and clinic only — never the treatment or any
 * clinical detail (the "type" stays out of patient messages on purpose).
 */
import { DEFAULT_SMS_TEMPLATES, type ClinicSettings, type NotificationKind } from '@/lib/clinic/settings'
import { utcToZoned } from '@/lib/clinic/time'
import { MERGE_TAGS, fillTemplate, plainCharacters } from '@/lib/appointments/smsText'

export type MessageContext = {
  appointmentId: string
  startTime: Date
  endTime: Date
  patientFirstName: string
  providerName: string | null
  link: string
  icsLink: string
  settings: Pick<ClinicSettings, 'practice' | 'timezone' | 'locale' | 'reminderPolicy'>
}

// ─── Merge tags ──────────────────────────────────────────────────────────────

export { MERGE_TAGS, fillTemplate, plainCharacters, smsSegments } from '@/lib/appointments/smsText'

function dd_mm(d: Date, tz: string): string {
  const z = utcToZoned(d, tz)
  return `${z.date.slice(8, 10)}/${z.date.slice(5, 7)}`
}

export function mergeVars(ctx: MessageContext): Record<(typeof MERGE_TAGS)[number], string> {
  const tz = ctx.settings.timezone
  return {
    primeiro_nome: ctx.patientFirstName,
    data: dd_mm(ctx.startTime, tz),
    hora: utcToZoned(ctx.startTime, tz).time,
    medico: ctx.providerName ?? '',
    clinica: ctx.settings.practice.name,
    telefone_clinica: ctx.settings.practice.phone,
    morada: ctx.settings.practice.address,
    link: ctx.link,
  }
}

export function smsTemplateFor(kind: NotificationKind, settings: Pick<ClinicSettings, 'reminderPolicy'>): string {
  return settings.reminderPolicy.smsTemplates[kind]?.trim() || DEFAULT_SMS_TEMPLATES[kind]
}

export function renderSms(kind: NotificationKind, ctx: MessageContext): string {
  const text = fillTemplate(smsTemplateFor(kind, ctx.settings), mergeVars(ctx))
  return ctx.settings.reminderPolicy.smsPlainCharacters ? plainCharacters(text) : text
}

// ─── Calendar links ──────────────────────────────────────────────────────────

const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export function googleCalendarLink(ctx: Pick<MessageContext, 'startTime' | 'endTime' | 'providerName' | 'link' | 'settings'>): string {
  const p = ctx.settings.practice
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Consulta — ${p.name}`,
    dates: `${icsStamp(ctx.startTime)}/${icsStamp(ctx.endTime)}`,
    details: `${ctx.providerName ? `Com ${ctx.providerName}. ` : ''}Confirmar ou desmarcar: ${ctx.link}`,
    location: p.address,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')
}

/** RFC 5545 single event; UTC times so every calendar app shows the right local time. */
export function buildIcs(ctx: Pick<MessageContext, 'appointmentId' | 'startTime' | 'endTime' | 'providerName' | 'link' | 'settings'>, now = new Date(), cancelled = false): string {
  const p = ctx.settings.practice
  const host = (() => {
    try { return new URL(ctx.link).host } catch { return 'clinic.local' }
  })()
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Clinica//Agenda//PT',
    'CALSCALE:GREGORIAN',
    `METHOD:${cancelled ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VEVENT',
    `UID:${ctx.appointmentId}@${host}`,
    `DTSTAMP:${icsStamp(now)}`,
    `DTSTART:${icsStamp(ctx.startTime)}`,
    `DTEND:${icsStamp(ctx.endTime)}`,
    `SUMMARY:${icsEscape(`Consulta — ${p.name}`)}`,
    `LOCATION:${icsEscape(p.address)}`,
    `DESCRIPTION:${icsEscape(`${ctx.providerName ? `Com ${ctx.providerName}.\n` : ''}Confirmar ou desmarcar: ${ctx.link}\nTelefone: ${p.phone}`)}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    ...(cancelled ? [] : ['BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Consulta', 'END:VALARM']),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n') + '\r\n'
}

// ─── Email ───────────────────────────────────────────────────────────────────

const SUBJECTS: Record<NotificationKind, string> = {
  CONFIRMATION: 'Consulta marcada',
  REMINDER_DAY_BEFORE: 'Lembrete: a sua consulta é amanhã',
  REMINDER_HOURS_BEFORE: 'Lembrete: a sua consulta é hoje',
  RESCHEDULED: 'A sua consulta foi alterada',
  CANCELLED: 'A sua consulta foi desmarcada',
}

const INTROS: Record<NotificationKind, string> = {
  CONFIRMATION: 'A sua consulta está marcada.',
  REMINDER_DAY_BEFORE: 'Lembramos que tem consulta amanhã.',
  REMINDER_HOURS_BEFORE: 'Lembramos que tem consulta hoje.',
  RESCHEDULED: 'A sua consulta foi alterada para a data abaixo.',
  CANCELLED: 'A consulta abaixo foi desmarcada. Para marcar outra data, ligue-nos ou responda a este email.',
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderEmail(kind: NotificationKind, ctx: MessageContext): { subject: string; html: string; text: string } {
  const p = ctx.settings.practice
  const tz = ctx.settings.timezone
  const when = new Intl.DateTimeFormat(ctx.settings.locale, { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(ctx.startTime)
  const cancelled = kind === 'CANCELLED'
  const subject = `${SUBJECTS[kind]} — ${p.name}`
  const rows: [string, string][] = [
    ['Data e hora', when],
    ...(ctx.providerName ? [['Médico(a)', ctx.providerName] as [string, string]] : []),
    ['Morada', p.address],
    ['Telefone', p.phone],
  ]
  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${esc(href)}" style="display:inline-block;margin:4px 8px 4px 0;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;${primary ? 'background:#0f766e;color:#ffffff' : 'background:#f1f5f9;color:#0f172a'}">${esc(label)}</a>`
  const html = `<!doctype html><html lang="pt-PT"><body style="margin:0;background:#f8fafc;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a">
<div style="max-width:520px;margin:0 auto;padding:24px">
  <p style="font-size:13px;color:#64748b;margin:0 0 12px">${esc(p.name)}</p>
  <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:20px">
    <p style="font-size:16px;margin:0 0 16px">Olá ${esc(ctx.patientFirstName)},</p>
    <p style="font-size:15px;margin:0 0 16px">${esc(INTROS[kind])}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">
      ${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#64748b;width:120px">${esc(k)}</td><td style="padding:6px 0;${cancelled && k === 'Data e hora' ? 'text-decoration:line-through' : ''}">${esc(v)}</td></tr>`).join('')}
    </table>
    ${cancelled ? '' : `${button(ctx.link, 'Confirmar ou desmarcar', true)}${button(googleCalendarLink(ctx), 'Google Calendar', false)}${button(ctx.icsLink, 'Outro calendário (.ics)', false)}`}
  </div>
  <p style="font-size:12px;color:#94a3b8;margin:16px 0 0">Recebe este email porque tem uma consulta marcada em ${esc(p.name)}.</p>
</div></body></html>`
  const text = [
    `Olá ${ctx.patientFirstName},`,
    '',
    INTROS[kind],
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    ...(cancelled ? [] : [`Confirmar ou desmarcar: ${ctx.link}`, `Adicionar ao Google Calendar: ${googleCalendarLink(ctx)}`]),
    '',
    p.name,
  ].join('\n')
  return { subject, html, text }
}
