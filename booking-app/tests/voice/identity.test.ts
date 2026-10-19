import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }))

import { matchByCallerId, matchCandidates, nameMatches, normaliseName, parseDateOfBirth } from '@/lib/voice/identity'

const people = [
  { id: 'p1', firstName: 'Maria João', lastName: 'Silva Santos', dateOfBirth: new Date('1985-03-12T00:00:00Z') },
  { id: 'p2', firstName: 'Maria', lastName: 'Santos', dateOfBirth: new Date('1990-07-01T00:00:00Z') },
  { id: 'p3', firstName: 'José', lastName: 'Gonçalves', dateOfBirth: new Date('1972-11-30T00:00:00Z') },
  // Twins: same name and DOB — must never be disambiguated by guessing
  { id: 'p4', firstName: 'Ana', lastName: 'Costa', dateOfBirth: new Date('2001-05-05T00:00:00Z') },
  { id: 'p5', firstName: 'Ana', lastName: 'Costa', dateOfBirth: new Date('2001-05-05T00:00:00Z') },
]

describe('identity — names', () => {
  it('normalises accents, case and particles', () => {
    expect(normaliseName('José da Silva Gonçalves')).toEqual(['jose', 'silva', 'goncalves'])
  })

  it('accepts first name + any surname, the Portuguese way', () => {
    expect(nameMatches('Maria Santos', 'Maria João', 'Silva Santos')).toBe(true)
    expect(nameMatches('maria joão silva santos', 'Maria João', 'Silva Santos')).toBe(true)
    expect(nameMatches('Jose Goncalves', 'José', 'Gonçalves')).toBe(true)
  })

  it('rejects first name only and wrong surnames', () => {
    expect(nameMatches('Maria', 'Maria', 'Santos')).toBe(false)
    expect(nameMatches('Maria Ferreira', 'Maria', 'Santos')).toBe(false)
    expect(nameMatches('João Santos', 'Maria João', 'Silva Santos')).toBe(false)
  })
})

describe('identity — date of birth', () => {
  it.each([
    ['1985-03-12', '1985-03-12'],
    ['12/03/1985', '1985-03-12'],
    ['12-03-1985', '1985-03-12'],
    ['1.3.1985', '1985-03-01'],
  ])('parses %s (day first)', (input, expected) => {
    expect(parseDateOfBirth(input)).toBe(expected)
  })

  it.each(['31/02/1985', '1985', 'twelve March', '2999-01-01', '01/01/1850', 123])('rejects %s', (input) => {
    expect(parseDateOfBirth(input)).toBe(null)
  })
})

describe('identity — matching', () => {
  it('verifies on exact name + DOB', () => {
    const r = matchCandidates(people, 'Maria Santos', '1985-03-12')
    expect(r).toMatchObject({ status: 'verified', patient: { id: 'p1' } })
  })

  it('the same name with another DOB is a different person', () => {
    expect(matchCandidates(people, 'Maria Santos', '1990-07-01')).toMatchObject({ status: 'verified', patient: { id: 'p2' } })
  })

  it('a wrong DOB is not found (no hint about who exists)', () => {
    expect(matchCandidates(people, 'Maria Santos', '1985-03-13')).toEqual({ status: 'not_found' })
  })

  it('identical name + DOB is ambiguous — nothing is disclosed', () => {
    expect(matchCandidates(people, 'Ana Costa', '2001-05-05')).toEqual({ status: 'ambiguous' })
  })
})

describe('identity — records without a date of birth (Zappy imports)', () => {
  const noDob = [
    { id: 'z1', firstName: 'Rita', lastName: 'Ferreira', dateOfBirth: null, phone: '912 345 678' },
    { id: 'z2', firstName: 'Rita', lastName: 'Ferreira', dateOfBirth: null, phone: '+351 933 000 111' },
    { id: 'z3', firstName: 'Paulo', lastName: 'Ramos', dateOfBirth: new Date('1980-01-01T00:00:00Z'), phone: '+351912345678' },
  ]

  it('caller ID + full name verifies exactly one record', () => {
    const r = matchByCallerId(noDob, 'Rita Ferreira', '+351912345678')
    expect(r).toMatchObject({ status: 'verified', via: 'caller_id', patient: { id: 'z1' } })
  })

  it('the name must still match', () => {
    expect(matchByCallerId(noDob, 'Ana Ferreira', '+351912345678').status).toBe('not_found')
  })

  it('a record that has a DOB is never verified by phone', () => {
    expect(matchByCallerId(noDob, 'Paulo Ramos', '+351912345678').status).toBe('not_found')
  })

  it('two records on the same number with the same name → ambiguous', () => {
    const dup = [noDob[0], { ...noDob[0], id: 'z9' }]
    expect(matchByCallerId(dup, 'Rita Ferreira', '+351912345678').status).toBe('ambiguous')
  })

  it('DOB match never accepts a record with no DOB', () => {
    expect(matchCandidates([{ id: 'z1', firstName: 'Rita', lastName: 'Ferreira', dateOfBirth: null }], 'Rita Ferreira', '1990-01-01').status).toBe('not_found')
  })
})
