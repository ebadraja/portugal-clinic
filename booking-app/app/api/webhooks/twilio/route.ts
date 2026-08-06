import { NextRequest, NextResponse } from 'next/server'
import { validateWebhookSignature, formatPhoneE164 } from '@/lib/messaging/smsProvider'
import { classifySmsKeyword, handleSmsOptKeyword } from '@/lib/messaging/notifications-sms'

export const dynamic = 'force-dynamic'

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

function twimlResponse(): NextResponse {
  return new NextResponse(EMPTY_TWIML, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function POST(request: NextRequest) {
  try {
    const valid = await validateWebhookSignature(request.clone())
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
    }

    const formData = await request.formData()
    const from = String(formData.get('From') ?? '')
    const body = String(formData.get('Body') ?? '')
    const messageSid = String(formData.get('MessageSid') ?? '')

    let phoneE164: string
    try {
      phoneE164 = formatPhoneE164(from)
    } catch {
      console.log(`[sms-webhook] invalid From=${from} sid=${messageSid}`)
      return twimlResponse()
    }

    const keyword = classifySmsKeyword(body)
    if (keyword === 'stop' || keyword === 'start') {
      await handleSmsOptKeyword(phoneE164, keyword)
      return twimlResponse()
    }

    console.log(
      `[sms-webhook] unhandled inbound sid=${messageSid} from=${phoneE164.slice(0, 6)}***`,
    )
    return twimlResponse()
  } catch (error) {
    console.error('[POST /api/webhooks/twilio]', error)
    return twimlResponse()
  }
}
