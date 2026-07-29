import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const m = vi.hoisted(() => {
  const mockValidateRequest = vi.fn()
  const mockMessagesCreate = vi.fn()
  const mockQueueAdd = vi.fn()
  const mockRedisExists = vi.fn()
  const mockRedisSet = vi.fn()

  const mockPrisma = {
    patient: { findUnique: vi.fn(), update: vi.fn() },
    sMSOptOut: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    patientPortalSession: { findFirst: vi.fn() },
    settings: { findFirst: vi.fn() },
  }

  return {
    mockValidateRequest,
    mockMessagesCreate,
    mockQueueAdd,
    mockRedisExists,
    mockRedisSet,
    mockPrisma,
  }
})

vi.mock('twilio', () => ({
  default: Object.assign(
    vi.fn(() => ({
      messages: { create: m.mockMessagesCreate },
    })),
    { validateRequest: m.mockValidateRequest },
  ),
}))

vi.mock('bullmq', () => ({
  Queue: vi.fn(function Queue() {
    return { add: m.mockQueueAdd }
  }),
  Worker: vi.fn(function Worker() {
    return { on: vi.fn() }
  }),
  Job: class {},
}))

vi.mock('ioredis', () => ({
  default: vi.fn(function IORedis() {
    return {
      exists: m.mockRedisExists,
      set: m.mockRedisSet,
      disconnect: vi.fn(),
    }
  }),
}))

vi.mock('@/lib/prisma', () => ({ default: m.mockPrisma, prisma: m.mockPrisma }))

vi.mock('@/lib/messaging/portalAuth', () => ({
  findPatientByPhone: vi.fn(),
  createMagicLinkSession: vi.fn(),
}))

import twilio from 'twilio'
import {
  formatPhoneE164,
  sendSMS,
  setTwilioClientForTests,
  maskPhoneForDisplay,
} from '@/lib/messaging/smsProvider'
import {
  classifySmsKeyword,
  handleSmsOptKeyword,
} from '@/lib/messaging/notifications-sms'
import {
  processSmsJob,
  wasNotificationRecentlySent,
  markNotificationSent,
  setRateLimitRedisForTests,
} from '@/services/messageQueue'
import { findPatientByPhone } from '@/lib/messaging/portalAuth'
import IORedis from 'ioredis'

describe('lib/messaging/smsProvider', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TWILIO_ACCOUNT_SID = 'ACtest'
    process.env.TWILIO_AUTH_TOKEN = 'auth-token'
    process.env.TWILIO_PHONE_NUMBER = '+12534004479'
    setTwilioClientForTests(null)
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    setTwilioClientForTests(null)
  })

  describe('formatPhoneE164', () => {
    it('normalizes common US formats', () => {
      expect(formatPhoneE164('(253) 400-4479')).toBe('+12534004479')
      expect(formatPhoneE164('2534004479')).toBe('+12534004479')
      expect(formatPhoneE164('+12534004479')).toBe('+12534004479')
      expect(formatPhoneE164('1-253-400-4479')).toBe('+12534004479')
    })

    it('normalizes international numbers longer than 11 digits', () => {
      expect(formatPhoneE164('923041102372')).toBe('+923041102372')
      expect(formatPhoneE164('+923041102372')).toBe('+923041102372')
    })

    it('does not treat 12-digit international numbers as US', () => {
      const result = formatPhoneE164('923041102372')
      expect(result).not.toBe('+1923041102372')
      expect(result).not.toBe('+19230411023')
    })

    it('throws on empty input', () => {
      expect(() => formatPhoneE164('')).toThrow('Invalid phone number')
    })
  })

  describe('maskPhoneForDisplay', () => {
    it('masks middle digits', () => {
      const masked = maskPhoneForDisplay('+12534004479')
      expect(masked).toContain('253')
      expect(masked).toContain('4479')
      expect(masked).toMatch(/X+/)
    })
  })

  describe('sendSMS', () => {
    it('returns success with Twilio SID', async () => {
      m.mockMessagesCreate.mockResolvedValue({ sid: 'SM123' })
      setTwilioClientForTests({ messages: { create: m.mockMessagesCreate } })

      const result = await sendSMS({
        to: '2534004479',
        body: 'Test message',
        client: { messages: { create: m.mockMessagesCreate } },
      })

      expect(result).toEqual({ success: true, messageId: 'SM123' })
      expect(m.mockMessagesCreate).toHaveBeenCalledWith({
        body: 'Test message',
        from: '+12534004479',
        to: '+12534004479',
      })
    })

    it('returns failure when Twilio throws', async () => {
      m.mockMessagesCreate.mockRejectedValue(new Error('Twilio unreachable'))
      setTwilioClientForTests({ messages: { create: m.mockMessagesCreate } })

      const result = await sendSMS({
        to: '2534004479',
        body: 'Test',
        client: { messages: { create: m.mockMessagesCreate } },
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Twilio unreachable')
    })
  })

  describe('validateWebhookSignature', () => {
    it('delegates to twilio.validateRequest', async () => {
      m.mockValidateRequest.mockReturnValue(true)
      const { validateWebhookSignature } = await import('@/lib/messaging/smsProvider')

      const form = new FormData()
      form.set('From', '+12534004479')
      form.set('Body', 'STOP')
      const request = new Request('https://example.com/api/webhooks/twilio', {
        method: 'POST',
        body: form,
        headers: { 'x-twilio-signature': 'sig' },
      })

      const valid = await validateWebhookSignature(request)
      expect(valid).toBe(true)
      expect(twilio.validateRequest).toHaveBeenCalled()
    })
  })
})

describe('STOP/START keyword handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('classifies STOP and START keywords case-insensitively', () => {
    expect(classifySmsKeyword('stop')).toBe('stop')
    expect(classifySmsKeyword('UNSUBSCRIBE')).toBe('stop')
    expect(classifySmsKeyword('  start  ')).toBe('start')
    expect(classifySmsKeyword('hello')).toBe(null)
  })

  it('creates opt-out on STOP for matched patient', async () => {
    vi.mocked(findPatientByPhone).mockResolvedValue({
      id: 'patient-1',
      firstName: 'Emma',
      lastName: 'Doe',
      dateOfBirth: new Date(),
      phone: '+12534004479',
      parentPhone: null,
    } as never)
    m.mockPrisma.sMSOptOut.findFirst.mockResolvedValue(null)
    m.mockPrisma.sMSOptOut.create.mockResolvedValue({ id: 'opt-1' })
    m.mockPrisma.patient.update.mockResolvedValue({})

    await handleSmsOptKeyword('+12534004479', 'stop')

    expect(m.mockPrisma.sMSOptOut.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patientId: 'patient-1',
        phoneNumber: '+12534004479',
        isOptedOut: true,
      }),
    })
    expect(m.mockPrisma.patient.update).toHaveBeenCalledWith({
      where: { id: 'patient-1' },
      data: { smsOptOut: true },
    })
  })

  it('re-subscribes on START', async () => {
    vi.mocked(findPatientByPhone).mockResolvedValue({
      id: 'patient-1',
      phone: '+12534004479',
    } as never)
    m.mockPrisma.sMSOptOut.findFirst.mockResolvedValue({ id: 'opt-1' })
    m.mockPrisma.sMSOptOut.update.mockResolvedValue({})
    m.mockPrisma.patient.update.mockResolvedValue({})

    await handleSmsOptKeyword('+12534004479', 'start')

    expect(m.mockPrisma.sMSOptOut.update).toHaveBeenCalledWith({
      where: { id: 'opt-1' },
      data: expect.objectContaining({ isOptedOut: false }),
    })
    expect(m.mockPrisma.patient.update).toHaveBeenCalledWith({
      where: { id: 'patient-1' },
      data: { smsOptOut: false },
    })
  })
})

describe('SMS notification rate limiting', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TWILIO_ACCOUNT_SID = 'ACtest'
    process.env.TWILIO_AUTH_TOKEN = 'auth-token'
    process.env.TWILIO_PHONE_NUMBER = '+12534004479'
    const redis = new IORedis()
    setRateLimitRedisForTests(redis as never)
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    setRateLimitRedisForTests(null)
    setTwilioClientForTests(null)
  })

  it('skips notification when patient received SMS within 5 minutes', async () => {
    m.mockRedisExists.mockResolvedValue(1)
    m.mockMessagesCreate.mockResolvedValue({ sid: 'SM999' })

    const recentlySent = await wasNotificationRecentlySent('patient-1')
    expect(recentlySent).toBe(true)

    await processSmsJob({
      id: 'job-1',
      data: {
        to: '2534004479',
        body: 'You have a new message',
        type: 'notification',
        patientId: 'patient-1',
      },
    } as never)

    expect(m.mockMessagesCreate).not.toHaveBeenCalled()
  })

  it('sends notification and marks rate limit when not recently sent', async () => {
    m.mockRedisExists.mockResolvedValue(0)
    m.mockMessagesCreate.mockResolvedValue({ sid: 'SM888' })
    setTwilioClientForTests({ messages: { create: m.mockMessagesCreate } })

    await processSmsJob({
      id: 'job-2',
      data: {
        to: '2534004479',
        body: 'You have a new message',
        type: 'notification',
        patientId: 'patient-2',
      },
    } as never)

    expect(m.mockMessagesCreate).toHaveBeenCalled()
    await markNotificationSent('patient-2')
    expect(m.mockRedisSet).toHaveBeenCalled()
  })

  it('blocks notification jobs that contain OTP text', async () => {
    m.mockRedisExists.mockResolvedValue(0)
    m.mockMessagesCreate.mockResolvedValue({ sid: 'SM000' })
    setTwilioClientForTests({ messages: { create: m.mockMessagesCreate } })

    await processSmsJob({
      id: 'job-bad',
      data: {
        to: '2534004479',
        body: 'Your Kids 0-18 Pediatrics verification code is: 123456',
        type: 'notification',
        patientId: 'patient-1',
      },
    } as never)

    expect(m.mockMessagesCreate).not.toHaveBeenCalled()
  })

  it('does not rate-limit OTP messages', async () => {
    m.mockRedisExists.mockResolvedValue(1)
    m.mockMessagesCreate.mockResolvedValue({ sid: 'SM777' })
    setTwilioClientForTests({ messages: { create: m.mockMessagesCreate } })

    await processSmsJob({
      id: 'job-3',
      data: {
        to: '2534004479',
        body: 'Your code is 123456',
        type: 'otp',
        patientId: 'patient-1',
      },
    } as never)

    expect(m.mockMessagesCreate).toHaveBeenCalled()
  })
})
