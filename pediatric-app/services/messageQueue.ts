/**
 * SMS Queue Service — BullMQ + Redis for outbound SMS delivery.
 *
 * HIPAA: never log SMS body or OTP codes. Only log patientId + Twilio SID.
 */

import { Queue, Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import { sendSMS } from '@/lib/messaging/smsProvider'
import { REDIS_URL } from './emailQueue'

const connection = { url: REDIS_URL }

export const SMS_QUEUE_NAME = 'sms-send'

const NOTIFICATION_RATE_LIMIT_MS = 5 * 60 * 1000

export type SmsJobType = 'otp' | 'notification' | 'automation'

export interface SmsJobData {
  to: string
  body: string
  type: SmsJobType
  patientId?: string
  conversationId?: string
  automationRuleId?: string
  appointmentId?: string
}

export const smsQueue = new Queue<SmsJobData>(SMS_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'custom',
      delay: 0,
    },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
})

function getBackoffDelay(attemptsMade: number): number {
  const delays = [60_000, 300_000, 900_000]
  return delays[Math.min(attemptsMade, delays.length - 1)]
}

function notificationRateKey(patientId: string): string {
  return `sms:notification:${patientId}`
}

let rateLimitRedis: IORedis | null = null

function getRateLimitRedis(): IORedis {
  if (!rateLimitRedis) {
    rateLimitRedis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false })
  }
  return rateLimitRedis
}

/** @internal Test hook */
export function setRateLimitRedisForTests(client: IORedis | null): void {
  if (rateLimitRedis && rateLimitRedis !== client) {
    rateLimitRedis.disconnect()
  }
  rateLimitRedis = client
}

export async function wasNotificationRecentlySent(patientId: string): Promise<boolean> {
  const redis = getRateLimitRedis()
  const exists = await redis.exists(notificationRateKey(patientId))
  return exists === 1
}

export async function markNotificationSent(patientId: string): Promise<void> {
  const redis = getRateLimitRedis()
  await redis.set(notificationRateKey(patientId), '1', 'PX', NOTIFICATION_RATE_LIMIT_MS)
}

export async function processSmsJob(job: Job<SmsJobData>): Promise<void> {
  const { to, body, type, patientId } = job.data

  if (type === 'notification' || type === 'automation') {
    if (body.toLowerCase().includes('verification code')) {
      console.error(
        `[sms-queue] blocked ${type} job=${job.id} patientId=${patientId ?? 'n/a'} — body looks like OTP`,
      )
      return
    }

    if (type === 'notification' && patientId) {
      const recentlySent = await wasNotificationRecentlySent(patientId)
      if (recentlySent) {
        console.log(`[sms-queue] skipped patientId=${patientId} reason=rate_limited`)
        return
      }
    }
  }

  const result = await sendSMS({ to, body })
  if (!result.success) {
    throw new Error(result.error ?? 'SMS send failed')
  }

  console.log(
    `[sms-queue] sent type=${type} patientId=${patientId ?? 'n/a'} messageId=${result.messageId}`,
  )

  if (type === 'notification' && patientId) {
    await markNotificationSent(patientId)
  }
}

export function startSmsWorker(): Worker<SmsJobData> {
  const worker = new Worker<SmsJobData>(SMS_QUEUE_NAME, processSmsJob, {
    connection,
    settings: {
      backoffStrategy: (attemptsMade: number) => getBackoffDelay(attemptsMade),
    },
    limiter: { max: 30, duration: 60_000 },
    concurrency: 3,
  })

  worker.on('completed', (job) => {
    console.log(`[sms-queue] job=${job.id} type=${job.data.type} COMPLETED`)
  })

  worker.on('failed', (job, err) => {
    if (!job) return
    const willRetry = job.attemptsMade < (job.opts.attempts ?? 3)
    console.log(
      `[sms-queue] job=${job.id} type=${job.data.type} patientId=${job.data.patientId ?? 'n/a'} FAILED` +
        ` attempt=${job.attemptsMade} willRetry=${willRetry} err=${err.message}`,
    )
  })

  worker.on('error', (err) => {
    console.error('[sms-queue] worker error:', err.message)
  })

  return worker
}

export async function queueSms(
  data: SmsJobData,
  options?: { jobId?: string },
): Promise<string | undefined> {
  const jobId =
    options?.jobId ??
    (data.type === 'otp' && data.patientId
      ? `otp-${data.patientId}`
      : data.type === 'notification' && data.patientId && data.conversationId
        ? `notif-${data.patientId}-${data.conversationId}`
        : data.type === 'automation' && data.automationRuleId
          ? `auto-${data.automationRuleId}-${data.appointmentId ?? data.patientId}`
          : undefined)

  const job = await smsQueue.add(`sms-${data.type}`, data, {
    jobId,
    attempts: 3,
    backoff: { type: 'custom', delay: 0 },
  })
  return job.id
}
