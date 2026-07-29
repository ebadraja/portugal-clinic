/**
 * GET /api/email/unsubscribe?token=<jwt>
 * Verifies a signed unsubscribe token and opts the patient out of all emails.
 * Returns plain HTML — no React/Next.js page needed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// ── HTML helpers ──────────────────────────────────────────────────────────────

const BASE_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         background: #f8fafc; display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; padding: 16px; box-sizing: border-box; }
  .card { background: #fff; border-radius: 16px; padding: 48px 40px; max-width: 480px;
          width: 100%; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.08),
          0 8px 24px rgba(0,0,0,.06); border: 1px solid #e2e8f0; }
  .icon { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center;
          justify-content: center; margin: 0 auto 20px; font-size: 28px; }
  h1 { font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 12px; }
  p  { color: #64748b; font-size: 15px; line-height: 1.65; margin: 0; }
  .practice { margin-top: 28px; padding-top: 20px; border-top: 1px solid #f1f5f9;
              font-size: 13px; color: #94a3b8; }
`

function htmlPage(iconBg: string, iconChar: string, title: string, body: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div class="card">
    <div class="icon" style="background:${iconBg}">${iconChar}</div>
    <h1>${title}</h1>
    <p>${body}</p>
    <p class="practice">Kids 0-18 Integrated Pediatrics</p>
  </div>
</body>
</html>`
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

// ── GET handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return htmlPage(
      '#fef2f2', '⚠',
      'Invalid Link',
      'This unsubscribe link is missing required information. Please use the link from your email.',
    )
  }

  try {
    // Support EMAIL_UNSUBSCRIBE_SECRET first, fall back to NEXTAUTH_SECRET for dev
    const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET ?? process.env.NEXTAUTH_SECRET
    if (!secret) throw new Error('No signing secret configured')

    const key = new TextEncoder().encode(secret)
    const { payload } = await jwtVerify(token, key)

    if (payload.purpose !== 'unsubscribe' || typeof payload.patientId !== 'string') {
      return htmlPage(
        '#fef2f2', '⚠',
        'Invalid Link',
        'This link does not appear to be a valid unsubscribe link.',
      )
    }

    const patientId = payload.patientId

    const patient = await prisma.patient.findUnique({
      where:  { id: patientId },
      select: { id: true, parentEmail: true, email: true },
    })
    if (!patient) {
      return htmlPage(
        '#fef2f2', '⚠',
        'Link Not Found',
        'We could not find an account associated with this link. It may have already been processed.',
      )
    }

    const rawEmail = patient.parentEmail ?? patient.email ?? ''

    // Idempotent upsert
    await prisma.unsubscribe.upsert({
      where:  { patientId },
      create: { patientId, email: rawEmail, reason: 'user_clicked_unsubscribe' },
      update: { reason: 'user_clicked_unsubscribe' },
    })

    // Notify admins (fire-and-forget)
    notifyAdmins(patientId).catch(() => {})

    console.log(`[email-unsubscribe] patientId=${patientId} unsubscribed via link`)

    return htmlPage(
      '#f0fdf4', '✓',
      "You've been unsubscribed",
      "You will no longer receive email communications from Kids 0-18 Integrated Pediatrics. " +
      "If this was a mistake, please contact our office and we can re-add you.",
    )
  } catch (err) {
    const msg = (err as Error).message
    const isExpired = msg.includes('expired') || msg.includes('JWTExpired')

    if (isExpired) {
      return htmlPage(
        '#fffbeb', '⏱',
        'This link has expired',
        'The unsubscribe link has expired. If you wish to unsubscribe, please use the link ' +
        'in a more recent email or contact our office directly.',
      )
    }

    console.error('[email-unsubscribe] token error:', msg)
    return htmlPage(
      '#fef2f2', '⚠',
      'This link has expired',
      'The unsubscribe link is no longer valid. Please use the link from a more recent email, ' +
      'or contact our office to opt out.',
    )
  }
}

async function notifyAdmins(patientId: string): Promise<void> {
  const admins = await prisma.user.findMany({
    where:  { role: 'ADMIN', isActive: true },
    select: { id: true },
  })
  await Promise.all(admins.map(admin =>
    prisma.notification.create({
      data: {
        userId:     admin.id,
        type:       'warning',
        title:      'Patient Unsubscribed from Emails',
        message:    'A patient clicked the unsubscribe link in an email.',
        icon:       'alert',
        entityType: 'email_log',
        actionUrl:  `/patients/${patientId}`,
      },
    }),
  ))
}
