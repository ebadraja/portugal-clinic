/**
 * GET /api/email/view?token=<jwt>
 * Renders a signed email token as HTML in the browser.
 * Token contains patientId + appointmentId — re-resolves merge tags on the fly.
 */

import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { prisma } from '@/lib/prisma'
import { resolveMergeTags } from '@/lib/email/mergeTags'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const token = searchParams.get('token')

  if (!token) {
    return new NextResponse('<p>Invalid or missing token.</p>', {
      status: 400, headers: { 'Content-Type': 'text/html' },
    })
  }

  try {
    const secret = process.env.NEXTAUTH_SECRET ?? process.env.EMAIL_TOKEN_SECRET
    if (!secret) throw new Error('No signing secret')

    const key  = new TextEncoder().encode(secret)
    const { payload } = await jwtVerify(token, key)

    if (payload.purpose !== 'view_email' || typeof payload.patientId !== 'string') {
      return new NextResponse('<p>Invalid token purpose.</p>', {
        status: 400, headers: { 'Content-Type': 'text/html' },
      })
    }

    // Find the most recent email log for this patient to get the template
    const emailLog = await prisma.emailLog.findFirst({
      where:   { patientId: payload.patientId },
      orderBy: { createdAt: 'desc' },
      include: { template: true },
    })

    if (!emailLog?.template) {
      return new NextResponse('<p>Email not found.</p>', {
        status: 404, headers: { 'Content-Type': 'text/html' },
      })
    }

    const { html } = await resolveMergeTags(
      emailLog.template.htmlBody,
      emailLog.template.subject,
      payload.patientId,
      typeof payload.appointmentId === 'string' ? payload.appointmentId : undefined,
    )

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    console.error('[email-view] error:', (err as Error).message)
    return new NextResponse('<p>This link has expired or is invalid.</p>', {
      status: 400, headers: { 'Content-Type': 'text/html' },
    })
  }
}
