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
import { format, differenceInYears } from 'date-fns'
import { prisma } from '@/lib/prisma'

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

// ─── Cancellation policy: 48h for Monday + post-US-holiday, 24h otherwise ───

const US_HOLIDAY_MMDD = new Set([
  '01-01', // New Year's Day
  '06-19', // Juneteenth
  '07-04', // Independence Day
  '11-11', // Veterans Day
  '12-25', // Christmas
])

function isNearHoliday(date: Date): boolean {
  // Check if day before the appointment is a fixed-date holiday
  const dayBefore = new Date(date)
  dayBefore.setDate(dayBefore.getDate() - 1)
  const mmdd = `${String(dayBefore.getMonth() + 1).padStart(2, '0')}-${String(dayBefore.getDate()).padStart(2, '0')}`
  return US_HOLIDAY_MMDD.has(mmdd)
}

function getCancellationPolicyHours(appointmentDate: Date): number {
  const dow = appointmentDate.getDay() // 0=Sun, 1=Mon
  if (dow === 1) return 48             // Monday always 48h
  if (isNearHoliday(appointmentDate)) return 48
  return 24
}

// ─── Appointment type display label ──────────────────────────────────────────

const APPT_TYPE_LABELS: Record<string, string> = {
  WELL_CHILD_VISIT: 'Well-Child Visit',
  SICK_VISIT:       'Sick Visit',
  VACCINATION:      'Vaccination',
  FOLLOW_UP:        'Follow-Up Visit',
  CONSULTATION:     'Consultation',
  PROCEDURE:        'Procedure',
  OTHER:            'Appointment',
}

// ─── Practice constants (override via env vars) ───────────────────────────────

const PRACTICE = {
  name:    process.env.PRACTICE_NAME    ?? 'KiDS 0 to 18 Integrative Pediatrics',
  phone:   process.env.PRACTICE_PHONE   ?? '(555) 123-4567',
  address: process.env.PRACTICE_ADDRESS ?? '123 Medical Plaza Drive, Suite 100',
  website: process.env.PRACTICE_WEBSITE ?? 'https://kids-0-to-18-integrative-pediatrics.webflow.io',
}

// ─── Main engine ─────────────────────────────────────────────────────────────

export async function resolveMergeTags(
  templateHtmlBody: string,
  templateSubject:  string,
  patientId:        string,
  appointmentId?:   string,
): Promise<{ subject: string; html: string; plain: string }> {

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
  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://app.kids0218.com'

  const unsubscribeToken = await signToken(
    { patientId, purpose: 'unsubscribe' },
    '30d',
  )
  const viewToken = await signToken(
    { patientId, appointmentId: appointmentId ?? null, purpose: 'view_email' },
    '7d',
  )

  const unsubscribeLink  = `${baseUrl}/api/email/unsubscribe?token=${unsubscribeToken}`
  const viewInBrowserLink = `${baseUrl}/email/view?token=${viewToken}`

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
  const age = patient
    ? differenceInYears(new Date(), patient.dateOfBirth)
    : 0

  const patientFirstName = patient?.firstName ?? 'your child'
  const patientFullName  = patient ? `${patient.firstName} ${patient.lastName}` : 'your child'
  const patientDob       = patient ? format(patient.dateOfBirth, 'MMMM d, yyyy') : ''
  const patientAge       = patient ? `${age} year${age !== 1 ? 's' : ''} old` : ''

  const parentFirstName  = patient?.parentName?.split(' ')[0] ?? 'Parent'
  const parentFullName   = patient?.parentName ?? 'Parent/Guardian'
  const parentEmail      = patient?.parentEmail ?? patient?.email ?? ''
  const parentPhone      = patient?.parentPhone ?? patient?.phone ?? ''

  const apptDate         = appointment ? format(appointment.startTime, 'EEEE, MMMM d, yyyy') : ''
  const apptTime         = appointment ? format(appointment.startTime, 'h:mm a') : ''
  const apptType         = appointment ? (APPT_TYPE_LABELS[appointment.type] ?? 'Appointment') : ''
  const doctorName       = appointment?.provider ?? 'Dr. Tamas'
  const cancelHours      = appointment ? String(getCancellationPolicyHours(appointment.startTime)) : '24'

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
    practice_name:        PRACTICE.name,
    practice_phone:       PRACTICE.phone,
    practice_address:     PRACTICE.address,
    practice_website:     PRACTICE.website,

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
      description: "The child's first name",
      category: 'patient',
      requiresAppointment: false,
      fallback: 'your child',
    },
    {
      variable: '{{patient_full_name}}',
      label: 'Patient Full Name',
      description: "The child's full name",
      category: 'patient',
      requiresAppointment: false,
      fallback: 'your child',
    },
    {
      variable: '{{patient_dob}}',
      label: 'Patient Date of Birth',
      description: "Patient's date of birth (e.g. January 5, 2020)",
      category: 'patient',
      requiresAppointment: false,
      fallback: '',
    },
    {
      variable: '{{patient_age}}',
      label: 'Patient Age',
      description: "Patient's current age (e.g. '4 years old')",
      category: 'patient',
      requiresAppointment: false,
      fallback: '',
    },

    // ── Parent / Guardian ──────────────────────────────────────────────────
    {
      variable: '{{parent_first_name}}',
      label: 'Parent First Name',
      description: "Parent or guardian's first name",
      category: 'parent',
      requiresAppointment: false,
      fallback: 'Parent',
    },
    {
      variable: '{{parent_full_name}}',
      label: 'Parent Full Name',
      description: "Parent or guardian's full name",
      category: 'parent',
      requiresAppointment: false,
      fallback: 'Parent/Guardian',
    },
    {
      variable: '{{parent_email}}',
      label: 'Parent Email',
      description: "Parent's email address",
      category: 'parent',
      requiresAppointment: false,
      fallback: '',
    },
    {
      variable: '{{parent_phone}}',
      label: 'Parent Phone',
      description: "Parent's phone number",
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
      fallback: 'Dr. Tamas',
    },

    // ── Practice ───────────────────────────────────────────────────────────
    {
      variable: '{{practice_name}}',
      label: 'Practice Name',
      description: '"KiDS 0 to 18 Integrative Pediatrics"',
      category: 'practice',
      requiresAppointment: false,
      fallback: 'KiDS 0 to 18 Integrative Pediatrics',
    },
    {
      variable: '{{practice_phone}}',
      label: 'Practice Phone',
      description: 'Main office phone number',
      category: 'practice',
      requiresAppointment: false,
      fallback: '(555) 123-4567',
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
