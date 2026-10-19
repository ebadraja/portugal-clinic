/**
 * Helpers for streaming call recordings through the CRM (never linking the
 * browser to the provider URL).
 */

const DEFAULT_HOST_SUFFIXES = ['vapi.ai']

/** Hosts the server may fetch recordings from. Extend with VOICE_RECORDING_HOSTS="a.com,b.net". */
export function allowedRecordingHosts(env: Record<string, string | undefined> = process.env): string[] {
  const extra = (env.VOICE_RECORDING_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return [...DEFAULT_HOST_SUFFIXES, ...extra]
}

/** https only, and the hostname must equal or be a subdomain of an allowed host (prevents SSRF). */
export function isAllowedRecordingUrl(raw: string, hosts = allowedRecordingHosts()): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.username || url.password) return false
  const host = url.hostname.toLowerCase()
  return hosts.some((h) => host === h || host.endsWith(`.${h}`))
}

export type ByteRange = { start: number; end: number }

/**
 * Parses a single "bytes=a-b" range against a known size.
 * Returns null for no/unsupported header, "unsatisfiable" when out of bounds.
 */
export function parseRangeHeader(header: string | null, size: number): ByteRange | 'unsatisfiable' | null {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  const [, a, b] = m
  if (a === '' && b === '') return null
  let start: number
  let end: number
  if (a === '') {
    // suffix range: last N bytes
    const n = Number(b)
    if (n === 0) return 'unsatisfiable'
    start = Math.max(0, size - n)
    end = size - 1
  } else {
    start = Number(a)
    end = b === '' ? size - 1 : Math.min(Number(b), size - 1)
  }
  if (start >= size || start > end) return 'unsatisfiable'
  return { start, end }
}

/** Range requests from the beginning (or none) count as "a play"; later chunks are not re-audited. */
export function isPlaybackStart(rangeHeader: string | null): boolean {
  return !rangeHeader || /^bytes=0-/.test(rangeHeader.trim())
}
