import { describe, it, expect } from 'vitest'
import { base32Decode, base32Encode, generateTotpSecret, hotp, otpauthUri, totp, verifyTotp } from '@/lib/auth/totp'

// RFC 6238 appendix B (SHA1) uses the ASCII secret "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'))

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('t=%i → %s (last 6 digits of the RFC vectors)', (seconds, code) => {
    expect(totp(RFC_SECRET, seconds * 1000)).toBe(code)
  })

  it('HOTP matches RFC 4226 counter 0', () => {
    expect(hotp(Buffer.from('12345678901234567890'), 0)).toBe('755224')
  })

  it('base32 round-trips', () => {
    const buf = Buffer.from([0, 1, 2, 250, 255, 128])
    expect(base32Decode(base32Encode(buf))).toEqual(buf)
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI')
  })

  it('generated secrets are 160-bit base32', () => {
    const s = generateTotpSecret()
    expect(s).toMatch(/^[A-Z2-7]{32}$/)
    expect(base32Decode(s)).toHaveLength(20)
  })

  it('accepts ±1 step of clock drift, refuses further', () => {
    const at = 1_700_000_000_000
    const now = totp(RFC_SECRET, at)
    expect(verifyTotp(RFC_SECRET, now, { at })).not.toBeNull()
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, at - 30_000), { at })).not.toBeNull()
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, at + 30_000), { at })).not.toBeNull()
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, at - 90_000), { at })).toBeNull()
  })

  it('refuses a replayed code (same or older step)', () => {
    const at = 1_700_000_000_000
    const code = totp(RFC_SECRET, at)
    const step = verifyTotp(RFC_SECRET, code, { at })!
    expect(verifyTotp(RFC_SECRET, code, { at, lastUsedStep: step })).toBeNull()
  })

  it('rejects malformed codes', () => {
    expect(verifyTotp(RFC_SECRET, '12345')).toBeNull()
    expect(verifyTotp(RFC_SECRET, 'abcdef')).toBeNull()
    expect(verifyTotp(RFC_SECRET, '')).toBeNull()
  })

  it('builds an otpauth link for authenticator apps', () => {
    expect(otpauthUri('ABC', 'ana@clinic.pt', 'Clínica Nunes Monteiro')).toBe(
      'otpauth://totp/Cl%C3%ADnica%20Nunes%20Monteiro%3Aana%40clinic.pt?secret=ABC&issuer=Cl%C3%ADnica%20Nunes%20Monteiro&algorithm=SHA1&digits=6&period=30',
    )
  })
})
