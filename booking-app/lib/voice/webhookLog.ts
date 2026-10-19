import prisma from '@/lib/prisma'

export type WebhookOutcome = 'processed' | 'duplicate' | 'rejected' | 'error' | 'ignored'

/**
 * Records one webhook delivery (metadata only — never the payload body, which
 * contains transcripts). Fire-and-forget: logging must never fail a call.
 */
export function recordWebhookEvent(input: {
  eventType: string
  callId?: string | null
  outcome: WebhookOutcome
  reason?: string | null
}): void {
  prisma.voiceWebhookEvent
    .create({
      data: {
        provider: 'vapi',
        eventType: input.eventType.slice(0, 60),
        callId: input.callId?.slice(0, 120) ?? null,
        outcome: input.outcome,
        reason: input.reason?.slice(0, 300) ?? null,
      },
    })
    .catch((err: Error) => console.error('[voice-webhook-log] write failed:', err.message))
}

export type VoiceDeliveryStatus = {
  lastReportAt: string | null
  lastToolCallAt: string | null
  rejected24h: number
  errors24h: number
  processed24h: number
  recentProblems: { receivedAt: string; eventType: string; outcome: string; reason: string | null }[]
}

export async function getVoiceDeliveryStatus(now = new Date()): Promise<VoiceDeliveryStatus> {
  const since = new Date(now.getTime() - 24 * 3_600_000)
  const [lastReport, lastTool, rejected24h, errors24h, processed24h, recentProblems] = await Promise.all([
    prisma.voiceWebhookEvent.findFirst({
      where: { eventType: 'end-of-call-report', outcome: { in: ['processed', 'duplicate'] } },
      orderBy: { receivedAt: 'desc' },
      select: { receivedAt: true },
    }),
    prisma.voiceWebhookEvent.findFirst({
      where: { eventType: 'tool-calls', outcome: 'processed' },
      orderBy: { receivedAt: 'desc' },
      select: { receivedAt: true },
    }),
    prisma.voiceWebhookEvent.count({ where: { outcome: 'rejected', receivedAt: { gte: since } } }),
    prisma.voiceWebhookEvent.count({ where: { outcome: 'error', receivedAt: { gte: since } } }),
    prisma.voiceWebhookEvent.count({ where: { outcome: 'processed', receivedAt: { gte: since } } }),
    prisma.voiceWebhookEvent.findMany({
      where: { outcome: { in: ['rejected', 'error'] } },
      orderBy: { receivedAt: 'desc' },
      take: 10,
      select: { receivedAt: true, eventType: true, outcome: true, reason: true },
    }),
  ])
  return {
    lastReportAt: lastReport?.receivedAt.toISOString() ?? null,
    lastToolCallAt: lastTool?.receivedAt.toISOString() ?? null,
    rejected24h,
    errors24h,
    processed24h,
    recentProblems: recentProblems.map((p) => ({ ...p, receivedAt: p.receivedAt.toISOString() })),
  }
}

/** Plain-language explanation of a refusal, shown on the status screen. */
export function explainWebhookReason(reason: string | null): string {
  switch (reason) {
    case 'secret_not_configured':
      return 'VAPI_WEBHOOK_SECRET is not set on the server, so every delivery is refused. Set it in the hosting environment and paste the same value into the Vapi assistant’s server secret.'
    case 'missing_credential':
      return 'The request carried no secret. Set the server secret on the Vapi assistant (or phone number) to the value of VAPI_WEBHOOK_SECRET.'
    case 'bad_credential':
      return 'The secret sent by Vapi does not match VAPI_WEBHOOK_SECRET. Re-copy it into Vapi; if someone else is calling this URL, it is being refused correctly.'
    case 'invalid_json':
      return 'The body was not valid JSON.'
    default:
      return reason ?? 'Unknown'
  }
}
