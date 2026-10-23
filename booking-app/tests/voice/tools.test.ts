import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ locked: 1 }]),
    appointment: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), aggregate: vi.fn() },
    calendarBlock: { findMany: vi.fn().mockResolvedValue([]) },
    appointmentEvent: { create: vi.fn().mockResolvedValue({}) },
    appointmentNotification: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    patient: { update: vi.fn().mockResolvedValue({}) },
  }
  const prisma = {
    patient: { findMany: vi.fn(), findUnique: vi.fn() },
    appointment: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    calendarBlock: { findMany: vi.fn().mockResolvedValue([]) },
    callbackRequest: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    knowledgeItem: { findMany: vi.fn(), updateMany: vi.fn().mockResolvedValue({}) },
    user: { findMany: vi.fn().mockResolvedValue([{ id: 'admin-1' }]) },
    notification: { createMany: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  }
  return { prisma, tx }
})

vi.mock('@/lib/prisma', () => ({ prisma: m.prisma, default: m.prisma }))
vi.mock('@/lib/notifications/staffEmail', () => ({ emailStaffAlert: vi.fn().mockResolvedValue(true) }))

import { buildClinicSettings } from '@/lib/clinic/settings'
import { insuranceAnswer, openingHoursAnswer, rankKnowledge, runVoiceTool, type ToolContext } from '@/lib/voice/tools'

const settings = buildClinicSettings({ practicePhone: '928 494 871' })
// Saturday 17 Oct 2026 10:00 Lisbon
const SAT = new Date('2026-10-17T09:00:00Z')
// Monday 19 Oct 2026 10:00 Lisbon
const MON = new Date('2026-10-19T09:00:00Z')

const ctx = (over: Partial<ToolContext> = {}): ToolContext => ({ callId: 'call-1', callerPhone: '+351912345678', settings, now: SAT, ...over })

const MARIA = { id: 'p1', firstName: 'Maria', lastName: 'Santos', dateOfBirth: new Date('1985-03-12T00:00:00Z'), preferredProvider: null }

beforeEach(() => {
  vi.clearAllMocks()
  m.prisma.patient.findMany.mockResolvedValue([MARIA])
  m.prisma.appointment.findFirst.mockResolvedValue(null)
  m.prisma.appointment.findMany.mockResolvedValue([])
  m.tx.appointment.findMany.mockResolvedValue([])
  m.tx.appointment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'appt-1', ...data }))
  m.tx.appointment.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
    id: where.id, patientId: 'p1', startTime: new Date('2026-10-19T09:00:00Z'), endTime: new Date('2026-10-19T09:30:00Z'), status: 'SCHEDULED', ...data,
  }))
  m.tx.calendarBlock.findMany.mockResolvedValue([])
  m.prisma.calendarBlock.findMany.mockResolvedValue([])
  m.prisma.patient.findUnique.mockResolvedValue({ ...MARIA, status: 'ACTIVE', phone: '+351912345678', email: null, smsRemindersEnabled: true })
  m.prisma.appointment.findUnique.mockImplementation(async () => ({
    id: 'a1', patientId: 'p1', startTime: new Date('2026-10-19T09:00:00Z'), endTime: new Date('2026-10-19T09:45:00Z'), duration: 45,
    type: 'HYGIENE', status: 'SCHEDULED', provider: 'Dra. Ana Nunes', providerId: 'ana-nunes', checkedInAt: null,
    patient: { phone: '+351912345678', email: null, smsRemindersEnabled: true },
  }))
  m.prisma.user.findMany.mockResolvedValue([{ id: 'admin-1' }])
})

describe('lookup_patient', () => {
  it('asks for the DOB and discloses nothing without it', async () => {
    const r = await runVoiceTool('lookup_patient', { full_name: 'Maria Santos' }, ctx())
    expect(r).toMatch(/data de nascimento/)
    expect(m.prisma.patient.findMany).not.toHaveBeenCalled()
  })

  it('rejects the legacy first-name-only lookup', async () => {
    const r = await runVoiceTool('lookup_patient', { child_name: 'Maria' }, ctx())
    expect(r).toMatch(/nome completo/)
  })

  it('wrong DOB → not found, no data', async () => {
    const r = await runVoiceTool('lookup_patient', { full_name: 'Maria Santos', date_of_birth: '13/03/1985' }, ctx())
    expect(r).toMatch(/Não encontrei/)
    expect(r).not.toMatch(/Maria\b.*confirmada/)
  })

  it('verified → first name + next appointment; never DOB or insurance', async () => {
    m.prisma.appointment.findFirst.mockResolvedValue({ startTime: new Date('2026-10-20T08:30:00Z'), type: 'HYGIENE' })
    const r = await runVoiceTool('lookup_patient', { full_name: 'maria santos', date_of_birth: '12/03/1985' }, ctx())
    expect(r).toBe('Identidade confirmada: Maria. Próxima consulta: Higiene oral em terça-feira, 20 de outubro às 09:30.')
    expect(r).not.toMatch(/1985|seguro|insurance/i)
  })
})

describe('book_appointment', () => {
  const args = { full_name: 'Maria Santos', date_of_birth: '1985-03-12', date: '2026-10-19', time: '10:00', appointment_type: 'EVALUATION' }

  it('books in Lisbon time and audits with the call id', async () => {
    const r = await runVoiceTool('book_appointment', args, ctx())
    expect(r).toMatch(/^Consulta marcada: Consulta de avaliação para Maria, segunda-feira, 19 de outubro às 10:00/)
    expect(r).toMatch(/24 horas/)
    const data = m.tx.appointment.create.mock.calls[0][0].data
    expect(data.startTime.toISOString()).toBe('2026-10-19T09:00:00.000Z') // 10:00 WEST = 09:00 UTC
    expect(data.endTime.toISOString()).toBe('2026-10-19T09:30:00.000Z')
    expect(data).toMatchObject({ patientId: 'p1', type: 'EVALUATION', bookedVia: 'VOICE_AGENT', provider: 'Dra. Ana Nunes' })
    expect(m.tx.$queryRaw).toHaveBeenCalled() // day lock taken
    const auditData = m.prisma.auditLog.create.mock.calls[0][0].data
    expect(auditData).toMatchObject({ action: 'CREATE', entity: 'appointment', changes: expect.objectContaining({ vapiCallId: 'call-1' }) })
  })

  it('refuses an occupied slot', async () => {
    m.tx.appointment.findMany.mockResolvedValue([{ startTime: new Date('2026-10-19T09:00:00Z'), endTime: new Date('2026-10-19T09:30:00Z') }])
    const r = await runVoiceTool('book_appointment', args, ctx())
    expect(r).toMatch(/já está ocupado/)
    expect(m.tx.appointment.create).not.toHaveBeenCalled()
  })

  it.each([
    [{ time: '13:00' }, /pausa de almoço/],
    [{ time: '19:00' }, /fora do horário/],
    [{ date: '2026-10-17' }, /encerrada nesse dia da semana/],
    [{ date: '2026-12-08' }, /Imaculada Conceição/],
    [{ time: 'later' }, /HH:MM/],
  ])('refuses %o', async (over, expected) => {
    const r = await runVoiceTool('book_appointment', { ...args, ...over }, ctx())
    expect(r).toMatch(expected)
    expect(m.tx.appointment.create).not.toHaveBeenCalled()
  })

  it('does not book types reserved for the clinical team', async () => {
    const r = await runVoiceTool('book_appointment', { ...args, appointment_type: 'IMPLANT' }, ctx())
    expect(r).toMatch(/marcado pela equipa clínica/)
    expect(m.prisma.patient.findMany).not.toHaveBeenCalled()
  })

  it('unknown caller → reminds the agent of the new-patient callback rule', async () => {
    m.prisma.patient.findMany.mockResolvedValue([])
    const r = await runVoiceTool('book_appointment', args, ctx())
    expect(r).toMatch(/novos pacientes não são marcados diretamente/)
    expect(m.tx.appointment.create).not.toHaveBeenCalled()
  })
})

describe('cancel_appointment', () => {
  it('flags a cancellation inside the notice window', async () => {
    // Appointment Monday 10:00 Lisbon; now is Sunday 18 Oct 12:00 → 21h notice
    m.prisma.appointment.findFirst.mockResolvedValue({ id: 'a1', startTime: new Date('2026-10-19T09:00:00Z'), type: 'HYGIENE', duration: 45 })
    const r = await runVoiceTool('cancel_appointment', { full_name: 'Maria Santos', date_of_birth: '1985-03-12', appointment_date: '2026-10-19' }, ctx({ now: new Date('2026-10-18T11:00:00Z') }))
    expect(r).toMatch(/desmarcada/)
    expect(r).toMatch(/menos de 24 horas/)
    expect(m.tx.appointment.update.mock.calls[0][0].data.cancelReason).toMatch(/^\[Aviso tardio\]/)
    expect(m.tx.$queryRaw).toHaveBeenCalled() // same day lock as bookings
  })

  it('requires verification', async () => {
    const r = await runVoiceTool('cancel_appointment', { full_name: 'Maria Santos', appointment_date: '2026-10-19' }, ctx())
    expect(r).toMatch(/data de nascimento/)
    expect(m.prisma.appointment.update).not.toHaveBeenCalled()
    expect(m.tx.appointment.update).not.toHaveBeenCalled()
  })
})

describe('create_callback_request', () => {
  it('uses the server-side caller ID when no number is given', async () => {
    m.prisma.callbackRequest.findFirst.mockResolvedValue(null)
    m.prisma.callbackRequest.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'cb-1', ...data }))
    const r = await runVoiceTool('create_callback_request', { caller_name: 'Rui Costa', reason: 'Novo paciente, avaliação', is_new_patient: true }, ctx())
    expect(m.prisma.callbackRequest.create.mock.calls[0][0].data).toMatchObject({ phone: '+351912345678', isNewPatient: true, urgency: 'NORMAL', vapiCallId: 'call-1' })
    expect(r).toMatch(/terminado em 678/)
  })

  it('a retried tool call updates instead of duplicating', async () => {
    m.prisma.callbackRequest.findFirst.mockResolvedValue({ id: 'cb-1' })
    m.prisma.callbackRequest.update.mockResolvedValue({ id: 'cb-1' })
    await runVoiceTool('create_callback_request', { caller_name: 'Rui', reason: 'x' }, ctx())
    expect(m.prisma.callbackRequest.create).not.toHaveBeenCalled()
    expect(m.prisma.callbackRequest.update).toHaveBeenCalled()
  })

  it('urgent requests mention 112 and alert all staff', async () => {
    m.prisma.callbackRequest.findFirst.mockResolvedValue(null)
    m.prisma.callbackRequest.create.mockResolvedValue({ id: 'cb-2' })
    const r = await runVoiceTool('create_callback_request', { caller_name: 'Ana', reason: 'Dor forte e inchaço', urgency: 'urgent' }, ctx())
    expect(r).toMatch(/112/)
    await new Promise((res) => setTimeout(res, 0))
    expect(m.prisma.user.findMany.mock.calls.at(-1)?.[0].where.role).toEqual({ in: ['ADMIN', 'STAFF'] })
  })

  it('needs a valid phone if there is no caller ID', async () => {
    const r = await runVoiceTool('create_callback_request', { caller_name: 'X', reason: 'y', phone: '123' }, ctx({ callerPhone: null }))
    expect(r).toMatch(/número de telefone válido/)
  })
})

describe('transfer_to_human', () => {
  it('outside hours: do not transfer, offer a callback', async () => {
    const r = await runVoiceTool('transfer_to_human', { reason: 'Quer falar com alguém' }, ctx({ now: SAT }))
    expect(r).toMatch(/fechada/)
    expect(r).toMatch(/create_callback_request/)
  })

  it('open: transfer to the configured number', async () => {
    const r = await runVoiceTool('transfer_to_human', { reason: 'Quer falar com alguém' }, ctx({ now: MON }))
    expect(r).toBe('Contexto registado. Transfira a chamada para 928 494 871.')
  })
})

describe('kill switch', () => {
  it('blocks bookings but still takes callbacks', async () => {
    const paused = { ...settings, voiceAgent: { ...settings.voiceAgent, paused: true } }
    expect(await runVoiceTool('book_appointment', {}, ctx({ settings: paused }))).toMatch(/temporariamente limitado/)
    m.prisma.callbackRequest.findFirst.mockResolvedValue(null)
    m.prisma.callbackRequest.create.mockResolvedValue({ id: 'cb-3' })
    expect(await runVoiceTool('create_callback_request', { caller_name: 'A', reason: 'b' }, ctx({ settings: paused }))).toMatch(/Pedido registado/)
  })
})

describe('pure answers', () => {
  it('insurance', () => {
    expect(insuranceAnswer('advance care', settings)).toMatch(/^Sim, trabalhamos com AdvanceCare/)
    expect(insuranceAnswer('RNA ADE', settings)).toMatch(/RNA-ADE/)
    expect(insuranceAnswer('cheque dentista do SNS', settings)).toMatch(/^Não trabalhamos com SNS Cheque-Dentista/)
    expect(insuranceAnswer('Médis', settings)).toMatch(/Não tenho essa informação/)
  })

  it('opening hours', () => {
    const r = openingHoursAnswer(settings, MON)
    expect(r).toMatch(/^A clínica está aberta/)
    expect(r).toMatch(/segunda 09:30–18:00/)
    expect(r).toMatch(/sábado encerrado/)
    expect(r).toMatch(/12:30 às 14:00/)
    expect(openingHoursAnswer(settings, new Date('2026-10-19T11:45:00Z'))).toMatch(/fechada/) // 12:45 lunch
  })

  it('knowledge ranking matches on meaning words, not stopwords', () => {
    const items = [
      { question: 'Quanto custa a consulta de avaliação?', answer: 'A consulta de avaliação custa 45 €.', category: 'Preços', priority: 0 },
      { question: 'Aceitam pagamento com Scalapay?', answer: 'Sim, aceitamos Scalapay.', category: 'Pagamentos', priority: 0 },
    ]
    expect(rankKnowledge('quanto custa uma avaliação', items)[0].answer).toMatch(/45/)
    expect(rankKnowledge('posso pagar com scalapay', items)[0].answer).toMatch(/Scalapay/)
    expect(rankKnowledge('qual é a capital de França', items)).toEqual([])
  })
})
