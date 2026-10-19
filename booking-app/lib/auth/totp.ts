/**
 * TOTP two-factor codes (RFC 6238, HMAC-SHA1, 30 s, 6 digits) — the format every
 * authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) uses.
 * Node crypto only; no new dependency.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const STEP_SECONDS = 30
const DIGITS = 6

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch)
    if (idx === -1) throw new Error('Invalid base32')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** 160-bit secret, base32 (what the user types into their app). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

export function timeStep(at: Date | number = Date.now()): number {
  const ms = typeof at === 'number' ? at : at.getTime()
  return Math.floor(ms / 1000 / STEP_SECONDS)
}

/** HOTP value for a counter (RFC 4226). */
export function hotp(key: Buffer, counter: number, digits = DIGITS): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const h = createHmac('sha1', key).update(msg).digest()
  const offset = h[h.length - 1] & 0x0f
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3]
  return String(bin % 10 ** digits).padStart(digits, '0')
}

export function totp(secretBase32: string, at: Date | number = Date.now()): string {
  return hotp(base32Decode(secretBase32), timeStep(at))
}

/**
 * Checks a code against the current step ±1 (clock drift). Returns the matched
 * step so the caller can refuse its reuse, or null.
 */
export function verifyTotp(secretBase32: string, code: string, opts: { at?: Date | number; lastUsedStep?: number | null } = {}): number | null {
  const clean = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(clean)) return null
  const key = base32Decode(secretBase32)
  const now = timeStep(opts.at ?? Date.now())
  for (const step of [now, now - 1, now + 1]) {
    if (opts.lastUsedStep != null && step <= opts.lastUsedStep) continue
    const expected = Buffer.from(hotp(key, step))
    if (timingSafeEqual(expected, Buffer.from(clean))) return step
  }
  return null
}

export function otpauthUri(secretBase32: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
}
