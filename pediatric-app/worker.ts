/**
 * Email + SMS Worker Process
 * Run as a SEPARATE PM2 process alongside the Next.js app.
 *
 * Start manually:   npx tsx worker.ts
 * PM2 (production): pm2 start ecosystem.config.js  (see below)
 *
 * This process:
 *   1. Connects to Redis
 *   2. Starts BullMQ workers (email + SMS jobs)
 *   3. Starts the 15-min cron scheduler (queues appointment reminders)
 *   4. Gracefully shuts down on SIGTERM / SIGINT
 */

import 'dotenv/config'
import IORedis from 'ioredis'
import { startWorker as startEmailWorker, REDIS_URL } from './services/emailQueue'
import { startSmsWorker } from './services/messageQueue'
import { startEmailScheduler } from './services/emailScheduler'
import { startMessageScheduler } from './services/messageScheduler'

console.log('[worker] starting background worker process...')
console.log(`[worker] Redis: ${REDIS_URL}`)
console.log(`[worker] Email provider: ${process.env.SENDGRID_API_KEY ? 'SendGrid' : 'SMTP'}`)
console.log(`[worker] SMS provider: ${process.env.TWILIO_ACCOUNT_SID ? 'Twilio' : 'not configured'}`)

// Health-check connection (separate from BullMQ internals)
const redisProbe = new IORedis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false })
redisProbe.on('connect', () => console.log('[worker] Redis connected'))
redisProbe.on('error', (err: Error) => console.error('[worker] Redis error:', err.message))

// Start BullMQ workers
const emailWorker = startEmailWorker()
const smsWorker = startSmsWorker()
console.log('[worker] BullMQ email + SMS workers started')

// Start cron schedulers
startEmailScheduler()
startMessageScheduler()

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] received ${signal} — shutting down gracefully...`)
  try {
    await Promise.all([emailWorker.close(), smsWorker.close()])
    await redisProbe.quit()
    console.log('[worker] shutdown complete')
    process.exit(0)
  } catch (err) {
    console.error('[worker] error during shutdown:', (err as Error).message)
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))
process.on('uncaughtException', (err) => {
  console.error('[worker] uncaughtException:', err.message)
  shutdown('uncaughtException')
})
