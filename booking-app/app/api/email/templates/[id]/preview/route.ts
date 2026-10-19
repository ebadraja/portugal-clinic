import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { resolveMergeTags, getAvailableVariables } from '@/lib/email/mergeTags'
import { DEFAULT_BOOKING_POLICY, DEFAULT_PRACTICE, DEFAULT_PROVIDERS } from '@/lib/clinic/settings'

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
    // Sample patient; practice details are the clinic's own defaults.
    patient_first_name:        'Maria',
    patient_full_name:         'Maria Silva',
    patient_dob:               '12/03/1985',
    patient_age:               '41 anos',
    parent_first_name:         'Maria',
    parent_full_name:          'Maria Silva',
    parent_email:              'maria.silva@example.com',
    parent_phone:              '912 345 678',
    appointment_date:          'terça-feira, 20 de outubro',
    appointment_time:          '10:30',
    appointment_type:          'Consulta de avaliação',
    doctor_name:               DEFAULT_PROVIDERS[0]?.name ?? '',
    practice_name:             DEFAULT_PRACTICE.name,
    practice_phone:            DEFAULT_PRACTICE.phone,
    practice_address:          DEFAULT_PRACTICE.address,
    practice_website:          DEFAULT_PRACTICE.website,
    develo_link:               'https://develo.health/example',
    novopsych_link:            'https://novopsych.com.au/example',
    cancellation_policy_hours: String(DEFAULT_BOOKING_POLICY.cancellationNoticeHours),
    unsubscribe_link:          '#unsubscribe',
    view_in_browser_link:      '#view',
  }
  const replace = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m)
  return { subject: replace(subject), html: replace(htmlBody), plain: replace(plainBody) }
}
