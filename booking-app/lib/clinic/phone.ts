/**
 * Phone helpers for a Portuguese clinic.
 *
 * Portuguese numbers have 9 national digits (mobiles 9x, landlines 2x, some 3x)
 * and the country code 351. Callers arrive as "+351912345678" (caller ID) but
 * staff type "912 345 678", so matching compares the national significant
 * number (last 9 digits) rather than the raw string.
 */

export const DEFAULT_COUNTRY_CODE = '351'

export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '')
}

/**
 * Best-effort E.164. Returns null when the input can't be a phone number.
 *  - "+…" / "00…"            → international as given
 *  - 9 digits starting 2/3/9  → Portuguese (+351)
 *  - 351 + 9 digits           → Portuguese
 *  - 10 digits / 1+10 digits  → North American (+1), kept for legacy records
 *  - ≥ 11 digits              → international digits
 */
export function toE164(raw: string | null | undefined, defaultCountryCode = DEFAULT_COUNTRY_CODE): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  let digits = digitsOnly(trimmed)
  if (!digits) return null

  if (trimmed.startsWith('+')) return digits.length >= 8 ? `+${digits}` : null
  if (digits.startsWith('00')) {
    digits = digits.slice(2)
    return digits.length >= 8 ? `+${digits}` : null
  }
  if (digits.length === 9 && /^[239]/.test(digits)) return `+${defaultCountryCode}${digits}`
  if (digits.length === 12 && digits.startsWith('351')) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length >= 11) return `+${digits}`
  return null
}

/** Comparison key: the last 9 digits (Portuguese national number; also unique enough for legacy US numbers). */
export function phoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = digitsOnly(raw)
  return digits.length >= 9 ? digits.slice(-9) : null
}

export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = phoneKey(a)
  const kb = phoneKey(b)
  return ka !== null && ka === kb
}

/** "+351 912 *** 678" — safe for logs and staff lists. */
export function maskPhone(raw: string | null | undefined): string {
  const digits = raw ? digitsOnly(raw) : ''
  if (digits.length < 6) return '***'
  return `${digits.slice(0, digits.length - 6)}***${digits.slice(-3)}`
}
