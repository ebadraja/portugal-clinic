const buckets = new Map<string, number[]>()

/** Returns true when the limit is exceeded. */
export function isRateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (hits.length >= max) return true
  hits.push(now)
  buckets.set(key, hits)
  return false
}

export function chatbotMessageLimit(): number {
  const n = parseInt(process.env.CHATBOT_RATE_LIMIT ?? "30", 10)
  return Number.isFinite(n) && n > 0 ? n : 30
}
