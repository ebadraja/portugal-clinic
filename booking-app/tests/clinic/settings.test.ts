import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }))

import {
  DEFAULT_APPOINTMENT_TYPES,
  DEFAULT_BUSINESS_HOURS,
  buildClinicSettings,
  closureOn,
  easterSunday,
  hoursFor,
  parseBusinessHours,
  parseHolidays,
  portugueseNationalHolidays,
} from '@/lib/clinic/settings'

describe('lib/clinic/settings — defaults are the confirmed clinic facts', () => {
  it('opens Mon–Fri 09:30–18:00 with lunch 12:30–14:00, closed weekends', () => {
    const s = buildClinicSettings(null)
    expect(s.timezone).toBe('Europe/Lisbon')
    expect(s.locale).toBe('pt-PT')
    expect(s.businessHours.find((h) => h.day === 'Monday')).toEqual({ day: 'Monday', enabled: true, open: '09:30', close: '18:00' })
    expect(s.businessHours.find((h) => h.day === 'Saturday')?.enabled).toBe(false)
    expect(s.businessHours.find((h) => h.day === 'Sunday')?.enabled).toBe(false)
    expect(s.lunchBreak).toEqual({ enabled: true, start: '12:30', end: '14:00' })
    expect(s.bookingPolicy.newPatientMode).toBe('callback')
    expect(s.bookingPolicy.cancellationNoticeHours).toBe(24)
    expect(s.insurers.accepted).toContain('AdvanceCare')
    expect(s.insurers.notAccepted).toContain('SNS Cheque-Dentista')
    expect(s.voiceAgent.name).toBe('Acácia')
    expect(s.warnings).toEqual([])
  })

  it('only routine visit types are bookable by the agent by default', () => {
    const bookable = DEFAULT_APPOINTMENT_TYPES.filter((t) => t.agentBookable).map((t) => t.type)
    expect(bookable.sort()).toEqual(['EVALUATION', 'FOLLOW_UP', 'HYGIENE'])
  })
})

describe('lib/clinic/settings — tolerant parsing', () => {
  it('reads the existing stored business-hours format', () => {
    const stored = [
      { day: 'Monday', open: '08:00', close: '17:00', enabled: true },
      { day: 'Tuesday', open: '08:00', close: '17:00', enabled: true },
      { day: 'Wednesday', open: '08:00', close: '17:00', enabled: true },
      { day: 'Thursday', open: '08:00', close: '17:00', enabled: true },
      { day: 'Friday', open: '08:00', close: '17:00', enabled: true },
      { day: 'Saturday', open: '09:00', close: '13:00', enabled: true },
      { day: 'Sunday', open: '09:00', close: '13:00', enabled: false },
    ]
    const { value, warning } = parseBusinessHours(stored)
    expect(warning).toBe(null)
    expect(value[0].day).toBe('Sunday')
    expect(value.find((h) => h.day === 'Saturday')?.enabled).toBe(true)
  })

  it('falls back to defaults with a warning when hours are malformed', () => {
    const { value, warning } = parseBusinessHours([{ day: 'Monday', open: '9am', close: '5pm', enabled: true }])
    expect(value).toEqual(DEFAULT_BUSINESS_HOURS)
    expect(warning).toMatch(/Business hours/)
  })

  it('treats missing days as closed', () => {
    const { value } = parseBusinessHours([{ day: 'Monday', open: '09:00', close: '13:00', enabled: true }])
    expect(value.filter((h) => h.enabled).map((h) => h.day)).toEqual(['Monday'])
  })

  it('accepts the legacy string[] holidays format', () => {
    const { value } = parseHolidays(['2026-08-14', 'nonsense'])
    expect(value).toEqual({ observeNationalHolidays: true, closures: [{ date: '2026-08-14', name: 'Encerrado' }] })
  })

  it('replaces the legacy pediatric appointment-type list with dental defaults', () => {
    const s = buildClinicSettings({ appointmentTypes: [{ id: 1, name: 'Well-Child Visit', duration: 30 }] })
    expect(s.appointmentTypes).toEqual(DEFAULT_APPOINTMENT_TYPES)
    expect(s.warnings.join(' ')).toMatch(/legacy/)
  })

  it('rejects an invalid timezone instead of crashing', () => {
    const s = buildClinicSettings({ timezone: 'Mars/Olympus' })
    expect(s.timezone).toBe('Europe/Lisbon')
    expect(s.warnings.join(' ')).toMatch(/Timezone/)
  })
})

describe('lib/clinic/settings — Portuguese holidays', () => {
  it('computes Easter correctly', () => {
    expect(easterSunday(2026)).toBe('2026-04-05')
    expect(easterSunday(2027)).toBe('2027-03-28')
    expect(easterSunday(2024)).toBe('2024-03-31')
  })

  it('includes the moveable holidays', () => {
    const dates = portugueseNationalHolidays(2026).map((h) => h.date)
    expect(dates).toContain('2026-04-03') // Sexta-feira Santa
    expect(dates).toContain('2026-06-04') // Corpo de Deus
    expect(dates).toContain('2026-12-08')
    expect(dates).toHaveLength(13)
  })

  it('closureOn: national holidays, custom closures, opt-out of national', () => {
    expect(closureOn('2026-12-25', { observeNationalHolidays: true, closures: [] })).toBe('Natal')
    expect(closureOn('2026-12-25', { observeNationalHolidays: false, closures: [] })).toBe(null)
    expect(closureOn('2026-08-14', { observeNationalHolidays: true, closures: [{ date: '2026-08-14', name: 'Férias' }] })).toBe('Férias')
    expect(closureOn('2026-10-20', { observeNationalHolidays: true, closures: [] })).toBe(null)
  })

  it('hoursFor returns null on closed days', () => {
    expect(hoursFor('2026-10-17', DEFAULT_BUSINESS_HOURS)).toBe(null) // Saturday
    expect(hoursFor('2026-10-19', DEFAULT_BUSINESS_HOURS)?.open).toBe('09:30')
  })
})
