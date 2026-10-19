import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }))

import { CLIENT_COLUMNS, mapClientRow, parseBirth, parseConsent, resolveColumns, splitSegments, type MappedClient } from '@/lib/import/zappy'
import { clinicalAlerts, lifecycleOf } from '@/lib/patients/alerts'

// The exact header row of Zappy's client export (backoffice → customers → export).
const ZAPPY_HEADERS = 'nr\tname\temail\tmobile\tphone_main_note\tphone_2\tphone_2_note\tonline\tgender\tbirth_month\tbirth_day\tbirth_year\tvat_number\tfull_name\taddress\tzipcode\tcity\tsegment_automatic\tsegment_manual\tcrm_source\tcrm_referral\tcrm_referral_client_name\tobs_1\tobs_2\tobs_3\tinvoice_obs\tcrm_work\tcrm_next_step\tcrm_next_step_date\tloyaltycard_won_label\tloyaltycard_won_value\tdata_protection_type_appointments\tdata_protection_type_campaigns\tdata_protection_type_customer_records\tdata_protection_type_reminders_email\tdata_protection_type_reminders_sms\tdata_protection_type_share_photos\tdata_protection_type_share_photos_no_face\tdata_protection_type_survey\tRGPD_updated_on\tcreatedon\tnext_appointment_date\tlast_appointment_date'.split('\t')

const TODAY = '2026-10-19'
const cols = resolveColumns(ZAPPY_HEADERS, CLIENT_COLUMNS)

function row(over: Record<string, string>): Record<string, string> {
  return Object.fromEntries(ZAPPY_HEADERS.map((h) => [h, over[h] ?? '']))
}

function ok(r: ReturnType<typeof mapClientRow>): MappedClient {
  if ('reject' in r) throw new Error(r.reject)
  return r
}

describe('Zappy client export — every column is recognised', () => {
  it('maps all 44 headers except the intentionally unused "online"', () => {
    const used = new Set(Object.values(cols))
    const unused = ZAPPY_HEADERS.filter((h) => !used.has(h))
    expect(unused).toEqual(['online'])
  })

  it('maps each header to the right field', () => {
    expect(cols).toMatchObject({
      id: 'nr', name: 'name', fullName: 'full_name', phone: 'mobile', phoneNote: 'phone_main_note', phone2: 'phone_2', phone2Note: 'phone_2_note',
      nif: 'vat_number', birthDay: 'birth_day', birthMonth: 'birth_month', birthYear: 'birth_year', postalCode: 'zipcode',
      segments: 'segment_manual', segmentAuto: 'segment_automatic', origin: 'crm_source', referral: 'crm_referral', referralName: 'crm_referral_client_name',
      notes: 'obs_1', notes2: 'obs_2', notes3: 'obs_3', invoiceNotes: 'invoice_obs', crmWork: 'crm_work', crmNextStep: 'crm_next_step', crmNextStepDate: 'crm_next_step_date',
      consentCampaigns: 'data_protection_type_campaigns', consentRemindersSms: 'data_protection_type_reminders_sms', consentUpdatedOn: 'RGPD_updated_on',
      createdOn: 'createdon', nextAppointment: 'next_appointment_date', lastAppointment: 'last_appointment_date',
    })
  })
})

describe('mapClientRow', () => {
  const full = row({
    nr: '3068', name: 'Abílio Costa', email: 'ABILIO@Example.pt', mobile: '+351 912 345 678', phone_main_note: 'só depois das 18h',
    phone_2: '219 876 543', phone_2_note: 'casa', gender: 'M', birth_month: '3', birth_day: '12', birth_year: '1958', vat_number: '123456789',
    full_name: 'Abílio Manuel Costa', address: 'Rua das Flores 1', zipcode: '2665-123', city: 'Malveira',
    segment_automatic: 'Cliente Perdido',
    segment_manual: 'PCTE ONCOLÓGICA. ALERGICA AO ACIDO CLAVULANICO./ HOJE FOI FEITA A EXO|DIARIO CLINICO',
    crm_source: 'Instagram', crm_referral_client_name: 'Maria Santos', obs_1: 'Prefere manhãs', obs_3: 'Medo de agulhas',
    invoice_obs: 'Fatura em nome da empresa', crm_next_step: 'Ligar para marcar destartarização', crm_next_step_date: '2026-11-02',
    data_protection_type_appointments: 'Sim', data_protection_type_campaigns: 'Não', data_protection_type_reminders_email: '1',
    data_protection_type_reminders_sms: '0', RGPD_updated_on: '2024-05-10', createdon: '2019-02-01 10:00',
    next_appointment_date: '2026-10-28 10:30', last_appointment_date: '2025-03-04',
  })

  it('maps identity, contacts and invoice fields', () => {
    const m = ok(mapClientRow(full, cols, TODAY))
    expect(m.externalId).toBe('zappy:3068')
    expect(m.patient).toMatchObject({
      firstName: 'Abílio', lastName: 'Costa', invoiceName: 'Abílio Manuel Costa',
      phone: '+351912345678', phoneNote: 'só depois das 18h', phone2: '+351219876543', phone2Note: 'casa',
      email: 'abilio@example.pt', nif: '123456789', gender: 'MALE', address: 'Rua das Flores 1', zipCode: '2665-123', city: 'Malveira',
      invoiceNotes: 'Fatura em nome da empresa', clientSource: 'Instagram', referredBy: 'Maria Santos',
    })
    expect(m.patient.dateOfBirth?.toISOString().slice(0, 10)).toBe('1958-03-12')
    expect(m.patient.patientSince?.toISOString().slice(0, 10)).toBe('2019-02-01')
    expect(m.patient.lastVisitAt?.toISOString().slice(0, 10)).toBe('2025-03-04')
  })

  it('segments become tags and raise clinical alerts', () => {
    const m = ok(mapClientRow(full, cols, TODAY))
    expect(m.patient.tags).toEqual(['PCTE ONCOLÓGICA. ALERGICA AO ACIDO CLAVULANICO./ HOJE FOI FEITA A EXO', 'DIARIO CLINICO'])
    expect(clinicalAlerts({ tags: m.patient.tags }).map((a) => a.label)).toEqual(['Allergy', 'Oncology'])
  })

  it('consents: SMS refusal switches SMS reminders off; campaigns refusal → unsubscribe', () => {
    const m = ok(mapClientRow(full, cols, TODAY))
    expect(m.patient.smsRemindersEnabled).toBe(false)
    expect(m.patient.emailRemindersEnabled).toBe(true)
    expect(m.refusesCampaigns).toBe(true)
    expect(m.patient.consents).toMatchObject({ appointments: true, campaigns: false, remindersEmail: true, remindersSms: false, survey: null, updatedAt: '2024-05-10T00:00:00.000Z' })
  })

  it('notes, the CRM next step and the next appointment', () => {
    const m = ok(mapClientRow(full, cols, TODAY))
    expect(m.notes).toEqual(['Prefere manhãs', 'Medo de agulhas'])
    expect(m.followUp).toEqual({ reason: 'Próximo passo (Zappy): Ligar para marcar destartarização', dueAt: new Date('2026-11-02T00:00:00Z') })
    expect(m.nextAppointment).toEqual({ date: '2026-10-28', time: '10:30' })
  })

  it('an old CRM step becomes a note, not a callback', () => {
    const m = ok(mapClientRow(row({ nr: '1', name: 'Rita Ferreira', crm_next_step: 'Enviar orçamento', crm_next_step_date: '2023-01-10' }), cols, TODAY))
    expect(m.followUp).toBe(null)
    expect(m.notes).toEqual(['Próximo passo (Zappy): Enviar orçamento (2023-01-10)'])
  })

  it('birthday without a year: no DOB (identity needs it), but day + month for the 🎂', () => {
    const m = ok(mapClientRow(row({ nr: '2', name: 'Rita Ferreira', birth_day: '5', birth_month: 'Maio', birth_year: '' }), cols, TODAY))
    expect(m.patient.dateOfBirth).toBe(null)
    expect(m.patient).toMatchObject({ birthDay: 5, birthMonth: 5 })
  })

  it('only phone_2: it becomes the main phone', () => {
    const m = ok(mapClientRow(row({ nr: '3', name: 'Paulo Ramos', phone_2: '933 222 111' }), cols, TODAY))
    expect(m.patient).toMatchObject({ phone: '+351933222111', phone2: null })
  })

  it('a one-word name is completed from full_name', () => {
    const m = ok(mapClientRow(row({ nr: '4', name: 'Abilio', full_name: 'Abílio Joaquim Marques' }), cols, TODAY))
    expect(m.patient).toMatchObject({ firstName: 'Abílio', lastName: 'Joaquim Marques', invoiceName: null })
  })

  it('missing consents never switch reminders off', () => {
    const m = ok(mapClientRow(row({ nr: '5', name: 'Ana Costa' }), cols, TODAY))
    expect(m.patient.smsRemindersEnabled).toBe(true)
    expect(m.patient.emailRemindersEnabled).toBe(true)
    expect(m.refusesCampaigns).toBe(false)
  })

  it('reports bad data instead of inventing it', () => {
    const m = ok(mapClientRow(row({ nr: '6', name: 'Rui Lopes', mobile: '123', vat_number: '999999999', birth_day: '31', birth_month: '2', birth_year: '1990', email: 'not-an-email' }), cols, TODAY))
    expect(m.patient).toMatchObject({ phone: null, nif: null, dateOfBirth: null, email: null })
    expect(m.warnings.join(' ')).toMatch(/mobile not recognised.*invalid NIF.*birthday not recognised.*email not valid/)
  })

  it('no name → rejected', () => {
    expect(mapClientRow(row({ nr: '7' }), cols, TODAY)).toEqual({ reject: 'no name' })
  })
})

describe('helpers', () => {
  it.each([['Sim', true], ['1', true], ['Autorizado', true], ['Não', false], ['0', false], ['Não autorizado', false], ['', null], ['talvez', null]])('parseConsent(%s)', (raw, v) => {
    expect(parseConsent(raw)).toBe(v)
  })

  it('birth months by number or Portuguese/English name', () => {
    expect(parseBirth('12', 'março', '1985', TODAY)).toEqual({ date: '1985-03-12', day: 12, month: 3 })
    expect(parseBirth('12', 'Dec', '', TODAY)).toEqual({ date: null, day: 12, month: 12 })
    expect(parseBirth('29', '2', '2001', TODAY)).toEqual({ date: null, day: null, month: null }) // not a leap year
    expect(parseBirth('1', '1', '2030', TODAY)).toEqual({ date: null, day: 1, month: 1 }) // future year ignored
  })

  it('segments split on | ; and new lines, never on commas', () => {
    expect(splitSegments('A, B|C; D\nE')).toEqual(['A, B', 'C', 'D', 'E'])
  })

  it('lifecycle replaces Zappy\'s automatic segment', () => {
    const now = new Date('2026-10-19T12:00:00Z')
    const old = new Date('2020-01-01T00:00:00Z')
    expect(lifecycleOf({ lastVisitAt: new Date('2026-01-01T00:00:00Z'), patientSince: old, hasUpcoming: false }, now)).toBe('active')
    expect(lifecycleOf({ lastVisitAt: new Date('2024-01-01T00:00:00Z'), patientSince: old, hasUpcoming: false }, now)).toBe('lost')
    expect(lifecycleOf({ lastVisitAt: new Date('2024-01-01T00:00:00Z'), patientSince: old, hasUpcoming: true }, now)).toBe('active')
    expect(lifecycleOf({ lastVisitAt: null, patientSince: old, hasUpcoming: false }, now)).toBe('potential')
    expect(lifecycleOf({ lastVisitAt: null, patientSince: new Date('2026-10-10T00:00:00Z'), hasUpcoming: false }, now)).toBe('new')
  })

  it('clinical alerts from allergies, notes and tags', () => {
    expect(clinicalAlerts({ allergies: 'Penicilina' }).map((a) => a.label)).toEqual(['Allergy'])
    expect(clinicalAlerts({ medicalNotes: 'Toma Xarelto; diabético tipo 2' }).map((a) => a.label)).toEqual(['Anticoagulated', 'Diabetes'])
    expect(clinicalAlerts({ tags: ['VIP', 'DIARIO CLINICO'] })).toEqual([])
  })
})
