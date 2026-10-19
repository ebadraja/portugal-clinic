/**
 * Small fixed-window rate limiter for public auth endpoints.
 *
 * In-memory: on serverless each instance has its own window, so this slows
 * down brute force from one client rather than guaranteeing a global limit.
 * Tokens are 256-bit and single-use, so the limiter is defence in depth.
 */
type Window = { count: number; resetAt: number }

const buckets = new Map<string, Window>()

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSeconds: number } {
  if (buckets.size > 5000) {
    for (const [k, w] of buckets) if (w.resetAt <= now) buckets.delete(k)
  }
  const w = buckets.get(key)
  if (!w || w.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSeconds: 0 }
  }
  w.count += 1
  if (w.count > limit) return { ok: false, retryAfterSeconds: Math.ceil((w.resetAt - now) / 1000) }
  return { ok: true, retryAfterSeconds: 0 }
}

export function clientKey(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown').split(',')[0].trim()
}

export function __resetRateLimitsForTests(): void {
  buckets.clear()
}
