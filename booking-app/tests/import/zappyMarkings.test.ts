import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }))

import { csvRecords } from '@/lib/import/csv'
import {
  BOOKING_COLUMNS, detectDateOrder, guessProviderId, guessType, isPersonalTime, isWaitingList, mapStatus, parseDate, pick, resolveColumns,
} from '@/lib/import/zappy'

// Header of reports → MARKINGS → EXPORT (Zappy back office, English), tab-separated
const HEADER = 'date\tstatus\tclient_name\tclient_internal_nr\titem_name\tonline\tcategory\tservice_provider\tprice_base\tdiscount\tprice_final\tpayment_date\tcupao_id\tupdated_on\tnotes\tObs.3\tcancel_reason'

describe('Zappy MARKINGS export', () => {
  it('recognises every column that matters', () => {
    const row = 'October 20, 2026 5:00 PM\tMissing (unpaid bookings)\tPedro Alexandre Cal Francisco\t1234\tDevice Control\t0\tOrthodontics\tTELMO - TRAINING\t45.00\t0.00\t45.00\t\t\tOctober 19, 2026 12:37\tGYM\tx\t'
    const { headers, records } = csvRecords(`${HEADER}\n${row}\n`)
    const cols = resolveColumns(headers, BOOKING_COLUMNS)
    expect(cols).toMatchObject({
      date: 'date', status: 'status', clientName: 'client_name', clientId: 'client_internal_nr', service: 'item_name', channel: 'online',
      category: 'category', staff: 'service_provider', paymentDate: 'payment_date', notes: 'notes', notes2: 'Obs.3', cancelReason: 'cancel_reason',
    })
    expect(cols.id).toBeUndefined()
    expect(pick(records[0], cols, 'clientId')).toBe('1234')
    expect(pick(records[0], cols, 'staff')).toBe('TELMO - TRAINING')
  })

  it('dates as Zappy writes them', () => {
    expect(parseDate('October 20, 2026 17:15')).toEqual({ date: '2026-10-20', time: '17:15' })
    expect(parseDate('October 20, 2026 5:00 PM')).toEqual({ date: '2026-10-20', time: '17:00' })
    expect(parseDate('October 20, 2026 12:15 AM')).toEqual({ date: '2026-10-20', time: '00:15' })
    expect(parseDate('20 de outubro de 2026 09:30')).toEqual({ date: '2026-10-20', time: '09:30' })
    expect(parseDate('2026-10-20 17:15:00')).toEqual({ date: '2026-10-20', time: '17:15' })
    expect(parseDate('20/10/2026 08:15')).toEqual({ date: '2026-10-20', time: '08:15' })
    expect(parseDate('10/20/2026 5:00 PM', 'mdy')).toEqual({ date: '2026-10-20', time: '17:00' })
    expect(parseDate('Octember 20, 2026')).toBeNull()
  })

  it('works out whether a file writes day or month first', () => {
    expect(detectDateOrder(['10/05/2026 09:00', '10/20/2026 17:00'])).toBe('mdy')
    expect(detectDateOrder(['10/05/2026 09:00', '20/10/2026 17:00'])).toBe('dmy')
    expect(detectDateOrder(['10/05/2026', '2026-10-20'])).toBe('dmy')
  })

  it('English Zappy statuses', () => {
    expect(mapStatus('Missing (unpaid bookings)', true).status).toBe('NO_SHOW')
    expect(mapStatus('Missing (paid bookings)', true).status).toBe('NO_SHOW')
    expect(mapStatus('Cancelled', false).status).toBe('CANCELLED')
    expect(mapStatus('Confirmed', false)).toEqual({ status: 'CONFIRMED', inferred: false, note: null })
    expect(mapStatus('Awaiting customer confirmation', false)).toEqual({ status: 'SCHEDULED', inferred: false, note: null })
    expect(mapStatus('Awaiting confirmation from the professional', false).status).toBe('SCHEDULED')
    expect(mapStatus('It arrived', true)).toEqual({ status: 'COMPLETED', inferred: false, note: null })
    expect(mapStatus('Paid', true)).toEqual({ status: 'COMPLETED', inferred: false, note: null })
  })

  it('"Awaiting…" is not the waiting list; personal time is recognised', () => {
    expect(isWaitingList('Awaiting customer confirmation')).toBe(false)
    expect(isWaitingList('Appointments on a waiting list')).toBe(true)
    expect(isWaitingList('Lista de espera')).toBe(true)
    expect(isPersonalTime('Personal time')).toBe(true)
    expect(isPersonalTime('Tempo pessoal')).toBe(true)
    expect(isPersonalTime('Confirmed')).toBe(false)
  })

  it('guesses a type from the service and category', () => {
    expect(guessType('A1.01.01.05: Urgent consultation', 'Consultation')).toBe('EMERGENCY')
    expect(guessType('A1.01.01.02: Dental consultation', 'Consultation')).toBe('CONSULTATION')
    expect(guessType('First consultation', 'Generic')).toBe('EVALUATION')
    expect(guessType('Device Control', 'Orthodontics')).toBe('ORTHODONTICS')
    expect(guessType('Bleaching', '')).toBe('AESTHETICS')
    expect(guessType('Coroa', 'PROSTHESIS')).toBe('PROCEDURE')
    expect(guessType('Something', 'Featured')).toBeNull()
  })

  it('matches a Zappy column to a dentist by name, ignoring titles', () => {
    const providers = [{ id: 'ana-nunes', name: 'Dra. Ana Nunes' }, { id: 'telmo', name: 'Dr. Telmo Monteiro' }]
    expect(guessProviderId('ANA NUNES', providers)).toBe('ana-nunes')
    expect(guessProviderId('TELMO MONTEIRO', providers)).toBe('telmo')
    expect(guessProviderId('DR. KATHERINE', providers)).toBeNull()
    expect(guessProviderId('ALERTS', providers)).toBeNull()
  })
})
