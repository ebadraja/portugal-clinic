import { describe, it, expect } from 'vitest'
import { EMPTY_FILTER, activeFilterCount, buildEvents, buildResources, displayStatus, eventTooltip, matchesFilter, rangeStats, sourceGroup } from '@/components/agenda/calendarModel'
import type { AgendaAppointment, AgendaPayload } from '@/components/agenda/types'

function appt(over: Partial<AgendaAppointment> = {}): AgendaAppointment {
  return {
    id: 'a1', patientId: 'p1', patientName: 'Maria Santos', patientPhone: '+351912345678', tags: [],
    start: '2026-10-22T10:30', end: '2026-10-22T11:00', startUtc: '2026-10-22T09:30:00.000Z', duration: 30,
    type: 'HYGIENE', status: 'SCHEDULED', providerId: 'ana', provider: 'Dra. Ana', reason: null, notes: null, bookedVia: 'STAFF',
    confirmedAt: null, confirmedVia: null, checkedInAt: null, seriesId: null, allowedOverlap: false, reminder: 'none',
    alerts: { clinical: [], birthday: false, newPatient: false, dobMissing: false },
    ...over,
  }
}

const payload: AgendaPayload = {
  timezone: 'Europe/Lisbon', locale: 'pt-PT', from: '2026-10-22', to: '2026-10-22', serverTime: '', today: '2026-10-19',
  providers: [
    { id: 'ana', name: 'Dra. Ana', title: '', color: '#2563eb', active: true, workingHours: null, appointmentTypes: [], agentBookable: true, userId: null },
    { id: 'rui', name: 'Dr. Rui', title: '', color: '#10b981', active: false, workingHours: null, appointmentTypes: [], agentBookable: true, userId: null },
  ],
  appointmentTypes: [{ type: 'HYGIENE', label: 'Higiene oral', color: '#10b981', durationMinutes: 45, active: true }],
  businessHours: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => ({ day, enabled: !['Saturday', 'Sunday'].includes(day), open: '09:30', close: '18:00' })),
  lunchBreak: { enabled: true, start: '12:30', end: '14:00' },
  slotMinutes: 30, closures: [], appointments: [], blocks: [],
}

describe('agenda filters', () => {
  it('arrived sits between confirmed and completed', () => {
    expect(displayStatus(appt({ status: 'CONFIRMED', checkedInAt: '2026-10-22T09:25:00Z' }))).toBe('ARRIVED')
    expect(displayStatus(appt({ status: 'COMPLETED', checkedInAt: '2026-10-22T09:25:00Z' }))).toBe('COMPLETED')
  })

  it('booking sources group the way the desk thinks of them', () => {
    expect(['STAFF', 'WALK_IN', 'VOICE_AGENT', 'WEBSITE', 'PATIENT_LINK', 'IMPORT'].map(sourceGroup)).toEqual(['STAFF', 'STAFF', 'VOICE_AGENT', 'ONLINE', 'ONLINE', 'IMPORT'])
  })

  it('empty filter shows everything; each list narrows', () => {
    const a = appt({ bookedVia: 'VOICE_AGENT', alerts: { clinical: ['Allergy'], birthday: false, newPatient: false, dobMissing: false } })
    expect(matchesFilter(a, EMPTY_FILTER)).toBe(true)
    expect(matchesFilter(a, { ...EMPTY_FILTER, statuses: ['CONFIRMED'] })).toBe(false)
    expect(matchesFilter(a, { ...EMPTY_FILTER, statuses: ['SCHEDULED'], sources: ['VOICE_AGENT'] })).toBe(true)
    expect(matchesFilter(a, { ...EMPTY_FILTER, types: ['IMPLANT'] })).toBe(false)
    expect(matchesFilter(a, { ...EMPTY_FILTER, alertsOnly: true })).toBe(true)
    expect(matchesFilter(appt(), { ...EMPTY_FILTER, alertsOnly: true })).toBe(false)
    expect(activeFilterCount({ statuses: ['CONFIRMED'], sources: ['STAFF', 'IMPORT'], types: [], alertsOnly: true })).toBe(4)
  })

  it('buildEvents applies the filter but keeps blocks and closed-time shading', () => {
    const p = { ...payload, appointments: [appt({ id: 'a1' }), appt({ id: 'a2', status: 'CONFIRMED' })], blocks: [{ id: 'b1', providerId: null, start: '2026-10-22T15:00', end: '2026-10-22T16:00', kind: 'MEETING', reason: 'Formação', seriesId: null }] }
    const ev = buildEvents(p, { view: 'day', colorBy: 'type', filter: null, editable: true, eventFilter: { ...EMPTY_FILTER, statuses: ['CONFIRMED'] } })
    expect(ev.filter((e) => (e.extendedProps as { kind: string }).kind === 'appointment').map((e) => e.id)).toEqual(['a2'])
    expect(ev.some((e) => e.id === 'block:b1')).toBe(true)
    expect(ev.some((e) => (e.extendedProps as { kind: string }).kind === 'off')).toBe(true) // lunch etc.
  })

  it('an appointment of an inactive dentist still gets a column', () => {
    const p = { ...payload, appointments: [appt({ providerId: 'rui' })] }
    expect(buildResources(p, null).map((r) => r.id)).toEqual(['ana', '__none'])
    const ev = buildEvents(p, { view: 'day', colorBy: 'type', filter: null, editable: true })
    expect(ev.find((e) => e.id === 'a1')?.resourceIds).toEqual(['__none'])
  })
})

describe('stats and tooltip', () => {
  it('counts what the day header shows', () => {
    const s = rangeStats([
      appt({ id: '1' }),
      appt({ id: '2', status: 'CONFIRMED', checkedInAt: 'x' }),
      appt({ id: '3', status: 'COMPLETED' }),
      appt({ id: '4', status: 'NO_SHOW' }),
      appt({ id: '5', bookedVia: 'VOICE_AGENT' }),
    ])
    expect(s).toEqual({ total: 4, confirmed: 2, toConfirm: 2, arrived: 1, noShows: 1, byAgent: 1 })
  })

  it('hover text has the essentials, including clinical alerts', () => {
    const t = eventTooltip(appt({ notes: 'Sensível ao frio', alerts: { clinical: ['Allergy', 'Anticoagulated'], birthday: false, newPatient: false, dobMissing: false }, reminder: 'delivered' }), payload)
    expect(t.split('\n')).toEqual([
      '10:30–11:00 · Maria Santos',
      'Higiene oral · Dra. Ana',
      'Booked · Desk',
      '☎ +351912345678',
      '⚠ Allergy, Anticoagulated',
      'Notes: Sensível ao frio',
      'Reminder delivered',
    ])
  })
})
