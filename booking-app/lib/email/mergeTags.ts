/**
 * Merge Tag Variable Engine
 *
 * Resolves all {{variable}} tokens in an email template for a specific patient/appointment.
 * Uses sanitize-html (server-side safe) for HTML sanitization.
 * Uses jose (already bundled with next-auth) for signed unsubscribe / view-in-browser tokens.
 *
 * Usage:
 *   const { subject, html, plain } = await resolveMergeTags(
 *     template.htmlBody, template.subject, patientId, appointmentId?
 *   )
 */

import sanitizeHtml from 'sanitize-html'
import { SignJWT } from 'jose'
import { differenceInYears } from 'date-fns'
import { prisma } from '@/lib/prisma'
import { buildClinicSettings, getClinicSettings, type ClinicSettings } from '@/lib/clinic/settings'
import { formatDateLong, formatDateShort, formatTime } from '@/lib/clinic/time'

// ─── sanitize-html config (permissive for email templates) ───────────────────

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    'html', 'head', 'body', 'meta', 'title', 'style',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'img', 'font', 'center', 'hr',
    'div', 'span', 'section', 'article', 'header', 'footer',
    'button', 'pre', 'code',
  ],
  allowedAttributes: {
    '*':     ['style', 'class', 'id', 'align', 'valign', 'bgcolor', 'color', 'width', 'height'],
    'a':     ['href', 'name', 'target', 'rel', 'title'],
    'img':   ['src', 'alt', 'width', 'height', 'border', 'style'],
    'table': ['cellpadding', 'cellspacing', 'border', 'width', 'bgcolor'],
    'td':    ['colspan', 'rowspan', 'width', 'bgcolor', 'valign'],
    'th':    ['colspan', 'rowspan', 'width', 'bgcolor'],
    'font':  ['face', 'size', 'color'],
    'meta':  ['name', 'content', 'charset', 'http-equiv'],
    'style': [],
  },
  allowedStyles: {
    '*': {
      'color':            [/.*/],
      'background-color': [/.*/],
      'background':       [/.*/],
      'font-size':        [/.*/],
      'font-family':      [/.*/],
      'font-weight':      [/.*/],
      'font-style':       [/.*/],
      'text-align':       [/.*/],
      'text-decoration':  [/.*/],
      'line-height':      [/.*/],
      'letter-spacing':   [/.*/],
      'margin':           [/.*/],
      'margin-top':       [/.*/],
      'margin-bottom':    [/.*/],
      'margin-left':      [/.*/],
      'margin-right':     [/.*/],
      'padding':          [/.*/],
      'padding-top':      [/.*/],
      'padding-bottom':   [/.*/],
      'padding-left':     [/.*/],
      'padding-right':    [/.*/],
      'border':           [/.*/],
      'border-radius':    [/.*/],
      'width':            [/.*/],
      'max-width':        [/.*/],
      'height':           [/.*/],
      'display':          [/.*/],
      'vertical-align':   [/.*/],
    },
  },
  allowedSchemes:      ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
}

// ─── HTML → plain text ───────────────────────────────────────────────────────

function htmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi,   '\n')
    .replace(/<\/p>/gi,        '\n\n')
    .replace(/<\/tr>/gi,       '\n')
    .replace(/<\/div>/gi,      '\n')
    .replace(/<\/h[1-6]>/gi,   '\n\n')
    .replace(/<hr\s*\/?>/gi,   '\n---\n')
    .replace(/<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g,       '')
    .replace(/&amp;/g,         '&')
    .replace(/&lt;/g,          '<')
    .replace(/&gt;/g,          '>')
    .replace(/&quot;/g,        '"')
    .replace(/&#039;/g,        "'")
    .replace(/&nbsp;/g,        ' ')
    .replace(/\n{3,}/g,        '\n\n')
    .trim()
}

// ─── JWT helpers ──────────────────────────────────────────────────────────────

async function signToken(
  payload: Record<string, unknown>,
  expiresIn: string = '30d',
): Promise<string> {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.EMAIL_TOKEN_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET or EMAIL_TOKEN_SECRET env var is required')

  const key = new TextEncoder().encode(secret)
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key)
}

// ─── Clinic configuration ────────────────────────────────────────────────────
// Practice details, appointment-type labels, cancellation notice, time zone and
// locale all come from Settings (lib/clinic/settings.ts) — never from constants,
// so reminders can't carry a stale phone number or the pediatric 48-hour rule.

async function loadClinic(): Promise<ClinicSettings> {
  try {
    return await getClinicSettings()
  } catch {
    return buildClinicSettings(null)
  }
}

// ─── Main engine ─────────────────────────────────────────────────────────────

export async function resolveMergeTags(
  templateHtmlBody: string,
  templateSubject:  string,
  patientId:        string,
  appointmentId?:   string,
): Promise<{ subject: string; html: string; plain: string }> {

  const clinic = await loadClinic()

  // ── 1. Fetch patient ──────────────────────────────────────────────────────
  const patient = await prisma.patient.findUnique({
    where:  { id: patientId },
    select: {
      id: true, firstName: true, lastName: true, dateOfBirth: true,
      email: true, phone: true,
      parentName: true, parentEmail: true, parentPhone: true,
    },
  })

  // ── 2. Fetch appointment (if provided) ────────────────────────────────────
  let appointment: {
    id: string
    startTime: Date
    type: string
    provider: string | null
    notes: string | null
  } | null = null

  if (appointmentId) {
    appointment = await prisma.appointment.findUnique({
      where:  { id: appointmentId },
      select: { id: true, startTime: true, type: true, provider: true, notes: true },
    })
  }

  // ── 3. Generate signed tokens ─────────────────────────────────────────────
  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

  const unsubscribeToken = await signToken(
    { patientId, purpose: 'unsubscribe' },
    '30d',
  )
  const viewToken = await signToken(
    { patientId, appointmentId: appointmentId ?? null, purpose: 'view_email' },
    '7d',
  )

  const unsubscribeLink  = `${baseUrl}/api/email/unsubscribe?token=${unsubscribeToken}`
  const viewInBrowserLink = `${baseUrl}/api/email/view?token=${viewToken}`

  // ── 4. Develo & NovoPsych links ───────────────────────────────────────────
  // These are extracted from appointment notes using a JSON block, or built from env vars.
  // Expected format in appointment.notes: {..., "develo_link": "https://...", "novopsych_link": "https://..." }
  let develoLink   = process.env.DEVELO_BASE_URL   ? `${process.env.DEVELO_BASE_URL}?pid=${patientId}`    : ''
  let novopsychLink = process.env.NOVOPSYCH_BASE_URL ? `${process.env.NOVOPSYCH_BASE_URL}?pid=${patientId}` : ''

  if (appointment?.notes) {
    try {
      const notesJson = JSON.parse(appointment.notes)
      if (notesJson.develo_link)    develoLink    = notesJson.develo_link
      if (notesJson.novopsych_link) novopsychLink = notesJson.novopsych_link
    } catch { /* notes is plain text, not JSON */ }
  }

  // ── 5. Build variable map ─────────────────────────────────────────────────
  const dob = patient?.dateOfBirth ?? null
  const age = dob ? differenceInYears(new Date(), dob) : 0

  const patientFirstName = patient?.firstName ?? 'Patient'
  const patientFullName  = patient ? `${patient.firstName} ${patient.lastName}` : 'Patient'
  // DOB is a calendar date stored at UTC midnight — format it in UTC.
  const patientDob       = dob ? formatDateShort(dob, 'UTC', clinic.locale) : ''
  const patientAge       = dob ? `${age} year${age !== 1 ? 's' : ''} old` : ''

  const parentFirstName  = patient?.parentName?.split(' ')[0] ?? 'Contact'
  const parentFullName   = patient?.parentName ?? 'Contact'
  const parentEmail      = patient?.parentEmail ?? patient?.email ?? ''
  const parentPhone      = patient?.parentPhone ?? patient?.phone ?? ''

  const apptDate         = appointment ? formatDateLong(appointment.startTime, clinic.timezone, clinic.locale) : ''
  const apptTime         = appointment ? formatTime(appointment.startTime, clinic.timezone, clinic.locale) : ''
  const apptType         = appointment
    ? (clinic.appointmentTypes.find((t) => t.type === appointment!.type)?.label ?? 'Consulta')
    : ''
  const doctorName       = appointment?.provider ?? clinic.providers.find((p) => p.active)?.name ?? ''
  const cancelHours      = String(clinic.bookingPolicy.cancellationNoticeHours)

  const vars: Record<string, string> = {
    // Patient
    patient_first_name:   patientFirstName,
    patient_full_name:    patientFullName,
    patient_dob:          patientDob,
    patient_age:          patientAge,

    // Parent / Guardian
    parent_first_name:    parentFirstName,
    parent_full_name:     parentFullName,
    parent_email:         parentEmail,
    parent_phone:         parentPhone,

    // Appointment
    appointment_date:     apptDate,
    appointment_time:     apptTime,
    appointment_type:     apptType,
    doctor_name:          doctorName,

    // Practice
    practice_name:        clinic.practice.name,
    practice_phone:       clinic.practice.phone,
    practice_address:     clinic.practice.address,
    practice_website:     clinic.practice.website,

    // External service links
    develo_link:          develoLink,
    novopsych_link:       novopsychLink,

    // Policy
    cancellation_policy_hours: cancelHours,

    // Generated links
    unsubscribe_link:     unsubscribeLink,
    view_in_browser_link: viewInBrowserLink,
  }

  // ── 6. Replace all {{tags}} ───────────────────────────────────────────────
  const resolvedSubject = replaceTags(templateSubject,  vars)
  const resolvedHtml    = replaceTags(templateHtmlBody, vars)

  // ── 7. Sanitize HTML (server-safe via sanitize-html) ─────────────────────
  const sanitizedHtml = sanitizeHtml(resolvedHtml, SANITIZE_OPTIONS)

  // ── 8. Generate plain text ────────────────────────────────────────────────
  const plain = htmlToPlain(sanitizedHtml)

  return { subject: resolvedSubject, html: sanitizedHtml, plain }
}

function replaceTags(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return key in vars ? vars[key] : match  // keep {{unresolved}} as-is
  })
}

// ─── Variable catalogue ───────────────────────────────────────────────────────

export interface VariableDefinition {
  variable:           string        // e.g. "{{patient_first_name}}"
  label:              string        // e.g. "Patient First Name"
  description:        string        // shown in editor tooltip
  category:           'patient' | 'parent' | 'appointment' | 'practice' | 'links' | 'policy'
  requiresAppointment: boolean
  fallback:           string        // value used when data is missing
}

export function getAvailableVariables(): VariableDefinition[] {
  return [
    // ── Patient ────────────────────────────────────────────────────────────
    {
      variable: '{{patient_first_name}}',
      label: 'Patient First Name',
      description: "The patient's first name",
      category: 'patient',
      requiresAppointment: false,
      fallback: 'Patient',
    },
    {
      variable: '{{patient_full_name}}',
      label: 'Patient Full Name',
      description: "The patient's full name",
      category: 'patient',
      requiresAppointment: false,
      fallback: 'Patient',
    },
    {
      variable: '{{patient_dob}}',
      label: 'Patient Date of Birth',
      description: "Patient's date of birth (e.g. January 5, 1985)",
      category: 'patient',
      requiresAppointment: false,
      fallback: '',
    },
    {
      variable: '{{patient_age}}',
      label: 'Patient Age',
      description: "Patient's current age (e.g. '40 years old')",
      category: 'patient',
      requiresAppointment: false,
      fallback: '',
    },

    // ── Emergency contact / responsible party (tokens keep parent_* names) ─
    {
      variable: '{{parent_first_name}}',
      label: 'Contact First Name',
      description: "Emergency contact / responsible party's first name",
      category: 'parent',
      requiresAppointment: false,
      fallback: 'Contact',
    },
    {
      variable: '{{parent_full_name}}',
      label: 'Contact Full Name',
      description: "Emergency contact / responsible party's full name",
      category: 'parent',
      requiresAppointment: false,
      fallback: 'Contact',
    },
    {
      variable: '{{parent_email}}',
      label: 'Contact Email',
      description: "Emergency contact email address",
      category: 'parent',
      requiresAppointment: false,
      fallback: '',
    },
    {
      variable: '{{parent_phone}}',
      label: 'Contact Phone',
      description: "Emergency contact phone number",
      category: 'parent',
      requiresAppointment: false,
      fallback: '',
    },

    // ── Appointment ────────────────────────────────────────────────────────
    {
      variable: '{{appointment_date}}',
      label: 'Appointment Date',
      description: "Full date (e.g. Monday, July 14, 2025)",
      category: 'appointment',
      requiresAppointment: true,
      fallback: '',
    },
    {
      variable: '{{appointment_time}}',
      label: 'Appointment Time',
      description: "Time (e.g. 10:30 AM)",
      category: 'appointment',
      requiresAppointment: true,
      fallback: '',
    },
    {
      variable: '{{appointment_type}}',
      label: 'Appointment Type',
      description: "Visit type (e.g. Well-Child Visit, Sick Visit)",
      category: 'appointment',
      requiresAppointment: true,
      fallback: 'Appointment',
    },
    {
      variable: '{{doctor_name}}',
      label: 'Doctor Name',
      description: "Assigned provider name",
      category: 'appointment',
      requiresAppointment: true,
      fallback: 'Dra. Ana Nunes',
    },

    // ── Practice ───────────────────────────────────────────────────────────
    {
      variable: '{{practice_name}}',
      label: 'Practice Name',
      description: '"Clínica Dentária Nunes Monteiro"',
      category: 'practice',
      requiresAppointment: false,
      fallback: 'Clínica Dentária Nunes Monteiro',
    },
    {
      variable: '{{practice_phone}}',
      label: 'Practice Phone',
      description: 'Main office phone number',
      category: 'practice',
      requiresAppointment: false,
      fallback: '928 494 871',
    },
    {
      variable: '{{practice_address}}',
      label: 'Practice Address',
      description: 'Full street address',
      category: 'practice',
      requiresAppointment: false,
      fallback: '123 Medical Plaza Drive, Suite 100',
    },
    {
      variable: '{{practice_website}}',
      label: 'Practice Website',
      description: 'Website URL',
      category: 'practice',
      requiresAppointment: false,
      fallback: '',
    },

    // ── External service links ─────────────────────────────────────────────
    {
      variable: '{{develo_link}}',
      label: 'Develo Link',
      description: 'Patient-specific Develo developmental screening link (set DEVELO_BASE_URL env or store in appointment notes)',
      category: 'links',
      requiresAppointment: false,
      fallback: '',
    },
    {
      variable: '{{novopsych_link}}',
      label: 'NovoPsych Link',
      description: 'Patient-specific NovoPsych assessment link (set NOVOPSYCH_BASE_URL env or store in appointment notes)',
      category: 'links',
      requiresAppointment: false,
      fallback: '',
    },
    {
      variable: '{{unsubscribe_link}}',
      label: 'Unsubscribe Link',
      description: 'Signed link to opt out of emails (30-day token, REQUIRED in all bulk/automated emails)',
      category: 'links',
      requiresAppointment: false,
      fallback: '#',
    },
    {
      variable: '{{view_in_browser_link}}',
      label: 'View in Browser Link',
      description: 'Link to view this email in a browser (7-day token)',
      category: 'links',
      requiresAppointment: false,
      fallback: '#',
    },

    // ── Policy ─────────────────────────────────────────────────────────────
    {
      variable: '{{cancellation_policy_hours}}',
      label: 'Cancellation Policy Hours',
      description: 'Hours of notice required to cancel: 48h for Monday/post-holiday appointments, 24h for all others',
      category: 'policy',
      requiresAppointment: true,
      fallback: '24',
    },
  ]
}
