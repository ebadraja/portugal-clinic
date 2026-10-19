import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }))

import { buildIcs, fillTemplate, googleCalendarLink, plainCharacters, renderSms, smsSegments, type MessageContext } from '@/lib/appointments/messages'
import { DEFAULT_SMS_TEMPLATES, buildClinicSettings } from '@/lib/clinic/settings'

const settings = buildClinicSettings(null)
const ctx: MessageContext = {
  appointmentId: 'a1',
  startTime: new Date('2026-10-22T09:30:00Z'),
  endTime: new Date('2026-10-22T10:00:00Z'),
  patientFirstName: 'João',
  providerName: 'Dra. Ana Nunes',
  link: 'https://crm.example.pt/c/Ab3dE9kQ2xYz',
  icsLink: 'https://crm.example.pt/c/Ab3dE9kQ2xYz/ics',
  settings,
}

describe('SMS', () => {
  it('every default template fits one SMS in plain characters, with a typical link', () => {
    for (const [kind] of Object.entries(DEFAULT_SMS_TEMPLATES)) {
      const text = renderSms(kind as keyof typeof DEFAULT_SMS_TEMPLATES, ctx)
      const seg = smsSegments(text)
      expect(seg.encoding, kind).toBe('GSM-7')
      expect(seg.segments, `${kind}: ${text}`).toBe(1)
    }
  })

  it('accents force UCS-2 (70 characters per SMS) — why plain characters is the default', () => {
    expect(smsSegments('Clínica Dentária').encoding).toBe('UCS-2')
    expect(smsSegments(plainCharacters('Clínica Dentária, ação, nº 3')).encoding).toBe('GSM-7')
    expect(plainCharacters('Clínica Dentária, ação, nº 3')).toBe('Clinica Dentaria, acao, no 3')
  })

  it('counts long messages in parts', () => {
    expect(smsSegments('a'.repeat(161)).segments).toBe(2)
    expect(smsSegments('ã'.repeat(71)).segments).toBe(2)
    expect(smsSegments('€'.repeat(80)).length).toBe(160) // extension characters count double
  })

  it('custom template with unknown tags renders them empty', () => {
    expect(fillTemplate('Olá {{primeiro_nome}} {{nao_existe}} — {{ hora }}', { primeiro_nome: 'Ana', hora: '10:30' })).toBe('Olá Ana — 10:30')
  })

  it('uses the clinic’s custom text when set', () => {
    const custom = { ...settings, reminderPolicy: { ...settings.reminderPolicy, smsPlainCharacters: false, smsTemplates: { ...settings.reminderPolicy.smsTemplates, REMINDER_DAY_BEFORE: 'Até amanhã, {{primeiro_nome}}! {{hora}} com {{medico}}.' } } }
    expect(renderSms('REMINDER_DAY_BEFORE', { ...ctx, settings: custom })).toBe('Até amanhã, João! 10:30 com Dra. Ana Nunes.')
  })
})

describe('calendar', () => {
  it('Google link carries UTC times and the address', () => {
    const url = new URL(googleCalendarLink(ctx))
    expect(url.searchParams.get('dates')).toBe('20261022T093000Z/20261022T100000Z')
    expect(url.searchParams.get('location')).toBe(settings.practice.address)
  })

  it('ICS is a valid single event with CRLF line endings and escaped text', () => {
    const ics = buildIcs(ctx, new Date('2026-10-19T10:00:00Z'))
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('DTSTART:20261022T093000Z\r\n')
    expect(ics).toContain('UID:a1@crm.example.pt')
    expect(ics).toContain('BEGIN:VALARM')
    expect(ics).toMatch(/LOCATION:Rua Miguel Judicibus Ferreira 29A\\, Malveira/)
  })

  it('a cancelled appointment produces a CANCEL event', () => {
    const ics = buildIcs(ctx, new Date(), true)
    expect(ics).toContain('METHOD:CANCEL')
    expect(ics).toContain('STATUS:CANCELLED')
    expect(ics).not.toContain('VALARM')
  })
})
