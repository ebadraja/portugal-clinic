import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const m = vi.hoisted(() => ({
  mockValidateRequest: vi.fn(),
  mockMessagesCreate: vi.fn(),
  mockFindPatientIdByPhone: vi.fn(),
  mockPrisma: {
    patient: { update: vi.fn() },
    sMSOptOut: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  },
}))

vi.mock('twilio', () => ({
  default: Object.assign(
    vi.fn(() => ({ messages: { create: m.mockMessagesCreate } })),
    { validateRequest: m.mockValidateRequest },
  ),
}))
vi.mock('@/lib/prisma', () => ({ default: m.mockPrisma, prisma: m.mockPrisma }))
vi.mock('@/lib/voice/endOfCall', () => ({ findPatientIdByPhone: m.mockFindPatientIdByPhone }))

import twilio from 'twilio'
import { formatPhoneE164, sendSMS, setTwilioClientForTests, maskPhoneForDisplay, validateWebhookSignature } from '@/lib/sms/provider'
import { classifySmsKeyword, handleSmsOptKeyword } from '@/lib/sms/keywords'

describe('lib/sms/provider', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TWILIO_ACCOUNT_SID = 'ACtest'
    process.env.TWILIO_AUTH_TOKEN = 'auth-token'
    process.env.TWILIO_PHONE_NUMBER = '+351930000000'
    setTwilioClientForTests(null)
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    setTwilioClientForTests(null)
  })

  it('normalizes Portuguese and international numbers to E.164', () => {
    expect(formatPhoneE164('912 345 678')).toBe('+351912345678')
    expect(formatPhoneE164('00351912345678')).toBe('+351912345678')
    expect(formatPhoneE164('+351912345678')).toBe('+351912345678')
    expect(formatPhoneE164('923041102372')).toBe('+923041102372')
  })

  it('throws on empty input', () => {
    expect(() => formatPhoneE164('')).toThrow('Invalid phone number')
  })

  it('masks the middle digits for display', () => {
    const masked = maskPhoneForDisplay('+351912345678')
    expect(masked).toMatch(/X+/)
    expect(masked).not.toContain('2345')
  })

  it('sends from the clinic number and returns the Twilio SID', async () => {
    m.mockMessagesCreate.mockResolvedValue({ sid: 'SM123' })
    const result = await sendSMS({ to: '912 345 678', body: 'Lembrete', client: { messages: { create: m.mockMessagesCreate } } })
    expect(result).toEqual({ success: true, messageId: 'SM123' })
    expect(m.mockMessagesCreate).toHaveBeenCalledWith({ body: 'Lembrete', from: '+351930000000', to: '+351912345678' })
  })

  it('returns a failure instead of throwing when Twilio is unreachable', async () => {
    m.mockMessagesCreate.mockRejectedValue(new Error('Twilio unreachable'))
    const result = await sendSMS({ to: '912345678', body: 'Lembrete', client: { messages: { create: m.mockMessagesCreate } } })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Twilio unreachable')
  })

  it('validates inbound webhooks with the Twilio signature', async () => {
    m.mockValidateRequest.mockReturnValue(true)
    const form = new FormData()
    form.set('From', '+351912345678')
    form.set('Body', 'PARAR')
    const request = new Request('https://example.com/api/webhooks/twilio', { method: 'POST', body: form, headers: { 'x-twilio-signature': 'sig' } })
    expect(await validateWebhookSignature(request)).toBe(true)
    expect(twilio.validateRequest).toHaveBeenCalled()
  })
})

describe('STOP / START keywords', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.mockPrisma.sMSOptOut.updateMany.mockResolvedValue({ count: 0 })
  })

  it('classifies English and Portuguese keywords, case-insensitively', () => {
    expect(classifySmsKeyword('stop')).toBe('stop')
    expect(classifySmsKeyword('UNSUBSCRIBE')).toBe('stop')
    expect(classifySmsKeyword('parar')).toBe('stop')
    expect(classifySmsKeyword('SAIR')).toBe('stop')
    expect(classifySmsKeyword('  start  ')).toBe('start')
    expect(classifySmsKeyword('iniciar')).toBe('start')
    expect(classifySmsKeyword('obrigado')).toBe(null)
  })

  it('STOP from a patient’s number opts the number and the patient out', async () => {
    m.mockFindPatientIdByPhone.mockResolvedValue('patient-1')
    m.mockPrisma.sMSOptOut.findFirst.mockResolvedValue(null)

    await handleSmsOptKeyword('+351912345678', 'stop')

    expect(m.mockPrisma.sMSOptOut.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ patientId: 'patient-1', phoneNumber: '+351912345678', isOptedOut: true }),
    })
    expect(m.mockPrisma.patient.update).toHaveBeenCalledWith({ where: { id: 'patient-1' }, data: { smsOptOut: true } })
  })

  it('STOP from an unknown or shared number is kept on the number alone', async () => {
    m.mockFindPatientIdByPhone.mockResolvedValue(null)
    m.mockPrisma.sMSOptOut.findFirst.mockResolvedValue(null)

    await handleSmsOptKeyword('+351912345678', 'stop')

    expect(m.mockPrisma.sMSOptOut.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ patientId: null, phoneNumber: '+351912345678', isOptedOut: true }),
    })
    expect(m.mockPrisma.patient.update).not.toHaveBeenCalled()
  })

  it('START re-subscribes and clears every opt-out filed against the number', async () => {
    m.mockFindPatientIdByPhone.mockResolvedValue('patient-1')
    m.mockPrisma.sMSOptOut.findFirst.mockResolvedValue({ id: 'opt-1' })

    await handleSmsOptKeyword('+351912345678', 'start')

    expect(m.mockPrisma.sMSOptOut.update).toHaveBeenCalledWith({ where: { id: 'opt-1' }, data: expect.objectContaining({ isOptedOut: false }) })
    expect(m.mockPrisma.sMSOptOut.updateMany).toHaveBeenCalledWith({
      where: { phoneNumber: '+351912345678', isOptedOut: true },
      data: expect.objectContaining({ isOptedOut: false }),
    })
    expect(m.mockPrisma.patient.update).toHaveBeenCalledWith({ where: { id: 'patient-1' }, data: { smsOptOut: false } })
  })
})
