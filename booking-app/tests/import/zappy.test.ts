import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }))

import { csvRecords, decodeCsvBytes, detectDelimiter, parseCsv } from '@/lib/import/csv'
import {
  BOOKING_COLUMNS, CLIENT_COLUMNS, isValidNif, mapService, mapStaff, mapStatus, parseDate, parseDuration, parseTime,
  pick, refusesMarketing, resolveColumns, splitName, titleCase, type ZappyMap,
} from '@/lib/import/zappy'

describe('CSV', () => {
  it('Excel PT: semicolons, quotes with separators and newlines, CRLF, BOM', () => {
    const text = '﻿Nome;Observações\r\n"Silva; Maria";"linha 1\nlinha 2"\r\nJoão;"diz ""olá"""\r\n'
    expect(detectDelimiter(text)).toBe(';')
    const { headers, records } = csvRecords(text.replace(/^﻿/, ''))
    expect(headers).toEqual(['Nome', 'Observações'])
    expect(records).toEqual([
      { Nome: 'Silva; Maria', Observações: 'linha 1\nlinha 2' },
      { Nome: 'João', Observações: 'diz "olá"' },
    ])
  })

  it('decodes Windows-1252 bytes when the file is not UTF-8', () => {
    const bytes = new Uint8Array([0x4a, 0x6f, 0xe3, 0x6f]) // "João" in cp1252
    expect(decodeCsvBytes(bytes)).toBe('João')
  })

  it('skips blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n', ',')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('columns', () => {
  it('finds Zappy client columns regardless of accents, case and "Nº"', () => {
    const cols = resolveColumns(['Nº Cliente', 'Nome', 'Telemóvel', 'E-mail', 'Contribuinte', 'Data de Nascimento', 'Observações'], CLIENT_COLUMNS)
    expect(cols).toMatchObject({ id: 'Nº Cliente', name: 'Nome', phone: 'Telemóvel', email: 'E-mail', nif: 'Contribuinte', dob: 'Data de Nascimento', notes: 'Observações' })
  })

  it('a booking export with client id + client name maps both', () => {
    const cols = resolveColumns(['ID', 'Data', 'Hora Início', 'Hora Fim', 'Cliente', 'Nº Cliente', 'Serviço', 'Colaborador', 'Estado'], BOOKING_COLUMNS)
    expect(cols).toMatchObject({ id: 'ID', date: 'Data', start: 'Hora Início', end: 'Hora Fim', clientName: 'Cliente', clientId: 'Nº Cliente', service: 'Serviço', staff: 'Colaborador', status: 'Estado' })
    expect(pick({ Serviço: ' Destartarização ' }, cols, 'service')).toBe('Destartarização')
  })
})

describe('values', () => {
  it.each([
    ['22/10/2026', { date: '2026-10-22', time: null }],
    ['2026-10-22', { date: '2026-10-22', time: null }],
    ['22-10-26', { date: '2026-10-22', time: null }],
    ['22/10/2026 9:30', { date: '2026-10-22', time: '09:30' }],
    ['2026-10-22 14h05', { date: '2026-10-22', time: '14:05' }],
    ['46317', { date: '2026-10-22', time: null }], // Excel serial
  ])('parseDate(%s)', (raw, expected) => {
    expect(parseDate(raw)).toEqual(expected)
  })

  it('rejects impossible dates', () => {
    expect(parseDate('31/02/2026')).toBe(null)
    expect(parseDate('amanhã')).toBe(null)
  })

  it('times and durations as people type them', () => {
    expect(parseTime('9:30')).toBe('09:30')
    expect(parseTime('09h30')).toBe('09:30')
    expect(parseTime('0930')).toBe('09:30')
    expect(parseTime('25:00')).toBe(null)
    expect(parseDuration('45 min')).toBe(45)
    expect(parseDuration('1h30')).toBe(90)
    expect(parseDuration('01:30')).toBe(90)
  })

  it('NIF checksum', () => {
    expect(isValidNif('123456789')).toBe(true)
    expect(isValidNif('123 456 789')).toBe(true)
    expect(isValidNif('123456780')).toBe(false)
    expect(isValidNif('423456789')).toBe(false) // invalid first digit
  })

  it('Portuguese names', () => {
    expect(splitName('Maria João Silva Santos')).toEqual({ firstName: 'Maria', lastName: 'João Silva Santos' })
    expect(splitName('Rita')).toEqual({ firstName: 'Rita', lastName: '' })
    expect(titleCase('MARIA DA SILVA')).toBe('Maria da Silva')
    expect(titleCase('josé gonçalves-pereira')).toBe('José Gonçalves-Pereira')
  })

  it('marketing refusal only on an explicit no', () => {
    expect(refusesMarketing('Não')).toBe(true)
    expect(refusesMarketing('Sim')).toBe(false)
    expect(refusesMarketing('')).toBe(false)
  })
})

describe('booking status', () => {
  it.each([
    ['Confirmada', false, 'CONFIRMED'],
    ['Aguarda confirmação', false, 'SCHEDULED'],
    ['Faltou', true, 'NO_SHOW'],
    ['Cancelada', false, 'CANCELLED'],
    ['Desmarcada pelo cliente', true, 'CANCELLED'],
    ['Cliente chegou', true, 'COMPLETED'],
    ['', false, 'SCHEDULED'],
  ])('%s (past=%s) → %s', (raw, past, expected) => {
    expect(mapStatus(raw, past).status).toBe(expected)
  })

  it('past bookings still marked confirmed become COMPLETED, flagged as inferred', () => {
    expect(mapStatus('Confirmada', true)).toEqual({ status: 'COMPLETED', inferred: true, note: null })
  })

  it('waiting list has no slot — imported as cancelled with a note', () => {
    expect(mapStatus('Em lista de espera', false)).toEqual({ status: 'CANCELLED', inferred: false, note: 'Lista de espera no Zappy' })
  })
})

describe('mapping file', () => {
  const map: ZappyMap = {
    services: { Destartarização: 'HYGIENE', Branqueamento: 'AESTHETICS' },
    staff: { 'Ana Nunes': 'ana-nunes' },
    defaultType: 'OTHER',
    defaultProviderId: null,
  }

  it('services match without accents/case; combos use the first known part', () => {
    expect(mapService('destartarizacao', map)).toEqual({ type: 'HYGIENE', known: true })
    expect(mapService('Destartarização + Branqueamento', map)).toEqual({ type: 'HYGIENE', known: true })
    expect(mapService('Botox', map)).toEqual({ type: 'OTHER', known: false })
  })

  it('staff map to dentist ids; unknown → default', () => {
    expect(mapStaff('ANA NUNES', map)).toEqual({ providerId: 'ana-nunes', known: true })
    expect(mapStaff('Rui', map)).toEqual({ providerId: null, known: false })
  })
})
