/**
 * SendGrid Event Webhook Handler
 * Receives delivery event callbacks from SendGrid and updates email_logs.
 *
 * Setup in SendGrid dashboard:
 *   Settings → Mail Settings → Event Notifications
 *   URL: https://app.kids0218.com/api/email/webhook/sendgrid
 *   Events to enable: delivered, open, click, bounce, unsubscribe, spamreport
 *
 * Signature verification uses ECDSA P-256.
 * Public key comes from SendGrid dashboard → Event Webhook → Signature Verification
 * Store it in SENDGRID_WEBHOOK_PUBLIC_KEY (NOT a secret — it's a public key).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createVerify } from 'crypto'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import type { Prisma } from '@/lib/generated/prisma/client'

export const dynamic = 'force-dynamic'

// ── Signature verification ────────────────────────────────────────────────────

function verifySendGridSignature(
  publicKeyPem: string,
  rawBody:      Buffer,
  signature:    string,
  timestamp:    string,
): boolean {
  try {
    const verifier = createVerify('SHA256')
    verifier.update(timestamp)
    verifier.update(rawBody)
    return verifier.verify(publicKeyPem, signature, 'base64')
  } catch {
    return false
  }
}

// ── SendGrid event types ──────────────────────────────────────────────────────

interface SendGridEvent {
  event:         string   // delivered | open | click | bounce | dropped | unsubscribe | spamreport
  sg_message_id: string
  email?:        string
  timestamp?:    number
  url?:          string
  reason?:       string
  type?:         string   // bounce sub-type: bounce | blocked
  // Set by us at send time via customArgs so the webhook can match back to our log row
  custom_args?:  { email_log_id?: string; [k: string]: string | undefined }
}

// ── Status mapping ────────────────────────────────────────────────────────────

const EVENT_TO_STATUS: Record<string, string> = {
  delivered:         'DELIVERED',
  open:              'OPENED',
  click:             'CLICKED',
  bounce:            'BOUNCED',
  blocked:           'BOUNCED',
  dropped:           'BOUNCED',
  unsubscribe:       'UNSUBSCRIBED',
  group_unsubscribe: 'UNSUBSCRIBED',
  spamreport:        'UNSUBSCRIBED',
  deferred:          'QUEUED',
}

// ── POST /api/email/webhook/sendgrid ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Read raw body for signature verification
  const rawBody  = Buffer.from(await req.arrayBuffer())
  const bodyText = rawBody.toString('utf8')

  // Signature verification (skip if public key not configured — dev mode)
  const publicKey = process.env.SENDGRID_WEBHOOK_PUBLIC_KEY
  if (publicKey) {
    const signature = req.headers.get('x-twilio-email-event-webhook-signature') ?? ''
    const timestamp = req.headers.get('x-twilio-email-event-webhook-timestamp')  ?? ''

    if (!signature || !timestamp) {
      return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 401 })
    }

    const valid = verifySendGridSignature(publicKey, rawBody, signature, timestamp)
    if (!valid) {
      console.warn('[sendgrid-webhook] invalid signature — rejecting')
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }
  } else {
    console.warn('[sendgrid-webhook] SENDGRID_WEBHOOK_PUBLIC_KEY not set — skipping signature check')
  }

  let events: SendGridEvent[]
  try {
    events = JSON.parse(bodyText)
    if (!Array.isArray(events)) throw new Error('Expected array')
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  let processed = 0
  let skipped   = 0

  for (const event of events) {
    const newStatus = EVENT_TO_STATUS[event.event]
    if (!newStatus) { skipped++; continue }

    // Primary: match by email_log_id we stored in custom_args at send time (O(1) PK lookup)
    // Fallback: match by sg_message_id we stored in metadata (legacy / SMTP path)
    const emailLogId  = event.custom_args?.email_log_id
    const sgMessageId = event.sg_message_id?.split('.')[0]

    let log: { id: string; patientId: string; status: string } | null = null

    if (emailLogId) {
      log = await prisma.emailLog.findUnique({
        where:  { id: emailLogId },
        select: { id: true, patientId: true, status: true },
      })
    } else if (sgMessageId) {
      log = await prisma.emailLog.findFirst({
        where:  { metadata: { path: ['sg_message_id'], equals: sgMessageId } },
        select: { id: true, patientId: true, status: true },
      })
    }

    if (!log) { skipped++; continue }

    // Only advance status — never go backwards
    // Order: QUEUED → SENT → DELIVERED → OPENED → CLICKED
    const STATUS_RANK: Record<string, number> = {
      QUEUED: 0, SENT: 1, DELIVERED: 2, OPENED: 3, CLICKED: 4,
      BOUNCED: 5, FAILED: 5, UNSUBSCRIBED: 5,
    }
    const currentRank = STATUS_RANK[log.status] ?? 0
    const newRank     = STATUS_RANK[newStatus]  ?? 0
    if (newRank <= currentRank && !['BOUNCED', 'UNSUBSCRIBED', 'FAILED'].includes(newStatus)) {
      skipped++
      continue
    }

    const updateData: Prisma.EmailLogUpdateInput = { status: newStatus as Prisma.EmailLogUpdateInput['status'] }
    const eventTime = event.timestamp ? new Date(event.timestamp * 1000) : new Date()

    if (newStatus === 'OPENED')  updateData.openedAt  = eventTime
    if (newStatus === 'CLICKED') updateData.clickedAt = eventTime
    if (newStatus === 'BOUNCED') updateData.errorMessage = event.reason ?? event.type ?? 'bounced'

    await prisma.emailLog.update({ where: { id: log.id }, data: updateData })

    // Handle unsubscribes + spam reports — create unsubscribe record
    if (newStatus === 'UNSUBSCRIBED' && event.email) {
      const reason = event.event === 'spamreport'
        ? 'spam_report'
        : (event.event === 'group_unsubscribe' ? 'group_unsubscribe' : 'user_unsubscribed')
      await prisma.unsubscribe.upsert({
        where:  { patientId: log.patientId },
        create: { patientId: log.patientId, email: encrypt(event.email), reason },
        update: { email: encrypt(event.email), reason },
      })
      // Notify admin of unsubscribe
      notifyAdminOfUnsubscribe(log.patientId).catch(() => {})
    }

    processed++
  }

  // HIPAA: log event receipt but never log email addresses
  console.log(`[sendgrid-webhook] events=${events.length} processed=${processed} skipped=${skipped}`)

  return NextResponse.json({ received: true, processed, skipped })
}

// ── GET health check ──────────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({ status: 'SendGrid webhook receiver is active', timestamp: new Date().toISOString() })
}

async function notifyAdminOfUnsubscribe(patientId: string): Promise<void> {
  const admins = await prisma.user.findMany({
    where:  { role: 'ADMIN', isActive: true },
    select: { id: true },
  })
  for (const admin of admins) {
    await prisma.notification.create({
      data: {
        userId:    admin.id,
        type:      'warning',
        title:     'Patient Unsubscribed from Emails',
        message:   'A patient has unsubscribed from email communications.',
        icon:      'alert',
        entityType: 'email_log',
        actionUrl:  `/patients/${patientId}`,
      },
    })
  }
}
