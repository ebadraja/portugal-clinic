import { describe, it, expect } from 'vitest'
import {
  normalizePhone,
  phonesMatch,
  isSameDateOfBirth,
  hashPortalToken,
  hashSmsCode,
} from '@/lib/messaging/portalAuth'

describe('lib/messaging/portalAuth', () => {
  it('normalizes phone digits', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('5551234567')
  })

  it('matches phones by last 10 digits', () => {
    expect(phonesMatch('+1 555-123-4567', '5551234567')).toBe(true)
    expect(phonesMatch('5551234567', '5559999999')).toBe(false)
  })

  it('compares date of birth by calendar day', () => {
    const dob = new Date('2015-06-14T12:00:00Z')
    expect(isSameDateOfBirth(dob, '2015-06-14')).toBe(true)
    expect(isSameDateOfBirth(dob, '2015-06-15')).toBe(false)
  })

  it('hashes portal tokens deterministically', () => {
    const a = hashPortalToken('test-token')
    const b = hashPortalToken('test-token')
    expect(a).toBe(b)
    expect(a).not.toBe('test-token')
  })

  it('hashes SMS codes', () => {
    expect(hashSmsCode('123456')).not.toBe('123456')
  })
})
