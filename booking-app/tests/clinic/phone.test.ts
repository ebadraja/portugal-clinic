import { describe, it, expect } from 'vitest'
import { maskPhone, phoneKey, phonesMatch, toE164 } from '@/lib/clinic/phone'

describe('lib/clinic/phone', () => {
  it.each([
    ['912 345 678', '+351912345678'],
    ['928494871', '+351928494871'],
    ['219 876 543', '+351219876543'],
    ['+351 912 345 678', '+351912345678'],
    ['00351912345678', '+351912345678'],
    ['351912345678', '+351912345678'],
    ['(253) 400-4479', '+12534004479'],
    ['+34 600 123 456', '+34600123456'],
  ])('toE164(%s) = %s', (input, expected) => {
    expect(toE164(input)).toBe(expected)
  })

  it.each(['', '12345', 'abc', '812345678'])('toE164 rejects %s', (input) => {
    expect(toE164(input)).toBe(null)
  })

  it('matches caller ID against a locally typed number', () => {
    expect(phonesMatch('+351912345678', '912 345 678')).toBe(true)
    expect(phonesMatch('00351 912345678', '912345678')).toBe(true)
    expect(phonesMatch('+351912345678', '+351912345679')).toBe(false)
    expect(phonesMatch(null, '912345678')).toBe(false)
    expect(phonesMatch('1234', '1234')).toBe(false)
  })

  it('phone key is the last 9 digits', () => {
    expect(phoneKey('+351 912 345 678')).toBe('912345678')
    expect(phoneKey('12')).toBe(null)
  })

  it('masks for display', () => {
    expect(maskPhone('+351912345678')).toBe('351912***678')
    expect(maskPhone('12')).toBe('***')
  })
})
