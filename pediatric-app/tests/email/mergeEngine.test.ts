import { describe, it, expect, vi, beforeEach } from 'vitest'
import { jwtVerify } from 'jose'

// ── Shared mock state ─────────────────────────────────────────────────────────

const m = vi.hoisted(() => {
  const mockPrisma = {
    patient:     { findUnique: vi.fn() },
    appointment: { findUnique: vi.fn() },
  }
  return { mockPrisma }
})

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/prisma', () => ({ prisma: m.mockPrisma }))

// ── Import after mocks ────────────────────────────────────────────────────────

import { resolveMergeTags } from '@/lib/email/mergeTags'

// ── Shared test data ──────────────────────────────────────────────────────────

const PATIENT = {
  id:          'pt-1',
  firstName:   'Emma',
  lastName:    'Johnson',
  dateOfBirth: new Date('2019-03-15'),
  email:       null,
  phone:       null,
  parentName:  'Sarah Johnson',
  parentEmail: 'sarah@example.com',
  parentPhone: '(555) 987-6543',
}

const APPOINTMENT = {
  id:        'appt-1',
  startTime: new Date('2026-07-14T10:30:00.000Z'),
  type:      'WELL_CHILD_VISIT',
  provider:  'Dr. Tamas',
  notes:     null,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('mergeEngine (resolveMergeTags)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.mockPrisma.patient.findUnique.mockResolvedValue(PATIENT)
    m.mockPrisma.appointment.findUnique.mockResolvedValue(APPOINTMENT)
  })

  // ── Test 1 ────────────────────────────────────────────────────────────────

  it('replaces all patient and appointment merge tags for a complete record', async () => {
    const template = [
      'Hello {{parent_first_name}},',
      'Your child {{patient_first_name}} {{patient_full_name}} has a {{appointment_type}}',
      'on {{appointment_date}} at {{appointment_time}} with {{doctor_name}}.',
      '{{practice_name}} | {{practice_phone}}',
      '<a href="{{unsubscribe_link}}">Unsubscribe</a>',
    ].join(' ')

    const { subject, html, plain } = await resolveMergeTags(
      template, 'Reminder for {{patient_first_name}}', 'pt-1', 'appt-1',
    )

    // Subject tag replaced
    expect(subject).toContain('Emma')
    expect(subject).not.toContain('{{')

    // Patient tags resolved
    expect(html).toContain('Sarah')         // parent_first_name
    expect(html).toContain('Emma')          // patient_first_name
    expect(html).toContain('Emma Johnson')  // patient_full_name

    // Appointment tags resolved
    expect(html).toContain('Well-Child Visit') // appointment_type
    expect(html).toContain('Dr. Tamas')        // doctor_name

    // Practice constants resolved
    expect(html).toContain('KiDS 0 to 18')

    // Unsubscribe link generated (not left as raw tag)
    expect(html).toContain('/api/email/unsubscribe?token=')

    // Plain text generated
    expect(plain).toContain('Emma')

    // No unreplaced tags remain
    expect(html).not.toMatch(/\{\{[a-z_]+\}\}/)
  })

  // ── Test 2 ────────────────────────────────────────────────────────────────

  it('gracefully falls back when no appointment is provided', async () => {
    const template = 'Hi {{parent_first_name}}, appointment: {{appointment_date}} at {{appointment_time}}'

    const { html } = await resolveMergeTags(template, 'Subject', 'pt-1')
    // Appointment tags should be empty strings, not {{...}} placeholders
    expect(html).not.toContain('{{appointment_date}}')
    expect(html).not.toContain('{{appointment_time}}')
    // Patient tag still resolved
    expect(html).toContain('Sarah')
    // appointment.findUnique should not be called
    expect(m.mockPrisma.appointment.findUnique).not.toHaveBeenCalled()
  })

  // ── Test 3 ────────────────────────────────────────────────────────────────

  it('unsubscribe_link contains a valid signed JWT with correct purpose', async () => {
    const { html } = await resolveMergeTags(
      '<a href="{{unsubscribe_link}}">Unsubscribe</a>',
      'Subject',
      'pt-1',
    )

    // Extract the token from the generated link
    const match = html.match(/unsubscribe\?token=([A-Za-z0-9._-]+)/)
    expect(match, 'unsubscribe_link should contain a JWT token').toBeTruthy()

    const token = match![1]
    const secret = process.env.NEXTAUTH_SECRET!
    const key = new TextEncoder().encode(secret)

    const { payload } = await jwtVerify(token, key)

    expect(payload.patientId).toBe('pt-1')
    expect(payload.purpose).toBe('unsubscribe')
    // Token should be valid for ~30 days from now
    const thirtyDaysMs = 30 * 24 * 3600 * 1000
    expect(payload.exp! * 1000).toBeGreaterThan(Date.now() + thirtyDaysMs - 60_000)
  })
})
