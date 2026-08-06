import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { resolveMergeTags, getAvailableVariables } from '@/lib/email/mergeTags'

export const dynamic = 'force-dynamic'

// ── POST /api/email/templates/:id/preview ────────────────────────────────────
// Renders the template with a real or sample patient/appointment.
// Does NOT send any email.
//
// Body (all optional):
//   patientId:     string  — use a real patient for accurate merge tags
//   appointmentId: string  — use a real appointment
// If neither provided, falls back to a synthetic preview using sample data.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id }   = await params
    const body     = await req.json().catch(() => ({}))
    const { patientId, appointmentId } = body as { patientId?: string; appointmentId?: string }

    const template = await prisma.emailTemplate.findUnique({ where: { id } })
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

    let resolved: { subject: string; html: string; plain: string }

    if (patientId) {
      // Real patient — full merge tag resolution
      resolved = await resolveMergeTags(
        template.htmlBody,
        template.subject,
        patientId,
        appointmentId,
      )
    } else {
      // Synthetic preview — inject sample data directly so no DB fetch needed
      resolved = syntheticPreview(template.htmlBody, template.subject, template.plainBody ?? '')
    }

    // Highlight any remaining {{unresolved}} tags so template authors spot gaps
    const unresolvedTags = [...new Set(resolved.html.match(/\{\{\w+\}\}/g) ?? [])]

    return NextResponse.json({
      subject:        resolved.subject,
      html:           resolved.html,
      plain:          resolved.plain,
      unresolvedTags,
      availableVariables: getAvailableVariables().map(v => v.variable),
    })
  } catch (error) {
    console.error('[POST /api/email/templates/[id]/preview]', error)
    return NextResponse.json({ error: 'Failed to render preview' }, { status: 500 })
  }
}

function syntheticPreview(htmlBody: string, subject: string, plainBody: string) {
  const vars: Record<string, string> = {
    patient_first_name:        'Alex',
    patient_full_name:         'Alex Johnson',
    patient_dob:               'January 5, 2020',
    patient_age:               '5 years old',
    parent_first_name:         'Sarah',
    parent_full_name:          'Sarah Johnson',
    parent_email:              'sarah@example.com',
    parent_phone:              '(555) 987-6543',
    appointment_date:          'Monday, July 14, 2026',
    appointment_time:          '10:30 AM',
    appointment_type:          'Well-Child Visit',
    doctor_name:               'Dr. Tamas',
    practice_name:             'KiDS 0 to 18 Integrative Pediatrics',
    practice_phone:            '(555) 123-4567',
    practice_address:          '123 Medical Plaza Drive, Suite 100',
    practice_website:          'https://kids018.com',
    develo_link:               'https://develo.health/example',
    novopsych_link:            'https://novopsych.com.au/example',
    cancellation_policy_hours: '48',
    unsubscribe_link:          '#unsubscribe',
    view_in_browser_link:      '#view',
  }
  const replace = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m)
  return { subject: replace(subject), html: replace(htmlBody), plain: replace(plainBody) }
}
