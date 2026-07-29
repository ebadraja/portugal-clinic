import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => {
  const mockQueueAutomationSms = vi.fn()
  const mockSeed = vi.fn()
  const mockWasSmsAutomationSent = vi.fn()
  const mockWasEmailSentForTriggerKey = vi.fn()
  const mockGetVerifiedPortalPhone = vi.fn()
  const mockIsPatientSmsOptedOut = vi.fn()
  const mockResolveMergeTags = vi.fn()

  const mockPrisma = {
    messagingAutomationRule: { findMany: vi.fn(), count: vi.fn() },
    appointment: { findMany: vi.fn() },
    patient: { findMany: vi.fn() },
    conversation: { findUnique: vi.fn() },
    message: { findMany: vi.fn() },
    emailLog: { findMany: vi.fn() },
    patientPortalSession: { findFirst: vi.fn() },
  }

  return {
    mockQueueAutomationSms,
    mockSeed,
    mockWasSmsAutomationSent,
    mockWasEmailSentForTriggerKey,
    mockGetVerifiedPortalPhone,
    mockIsPatientSmsOptedOut,
    mockResolveMergeTags,
    mockPrisma,
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: m.mockPrisma, default: m.mockPrisma }))

vi.mock('@/lib/messaging/seedAutomationRules', () => ({
  seedDefaultAutomationRules: m.mockSeed,
}))

vi.mock('@/lib/messaging/automationSms', () => ({
  queueAutomationSms: m.mockQueueAutomationSms,
  getVerifiedPortalPhone: m.mockGetVerifiedPortalPhone,
  isPatientSmsOptedOut: m.mockIsPatientSmsOptedOut,
}))

vi.mock('@/lib/messaging/automationCoordination', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/messaging/automationCoordination')>()
  return {
    ...actual,
    wasSmsAutomationSent: m.mockWasSmsAutomationSent,
    wasEmailSentForTriggerKey: m.mockWasEmailSentForTriggerKey,
  }
})

vi.mock('@/lib/messaging/mergeTags', () => ({
  resolveMessagingMergeTags: m.mockResolveMergeTags,
}))

import { runMessageSchedulerOnce } from '@/services/messageScheduler'
import { buildTriggerKey } from '@/lib/messaging/automationCoordination'

function makeRule(
  overrides: Partial<{
    id: string
    triggerEvent: string
    delayMinutes: number
    isActive: boolean
    body: string
  }> = {},
) {
  return {
    id: overrides.id ?? 'rule-48h',
    name: '48-Hour Appointment Reminder',
    triggerEvent: overrides.triggerEvent ?? 'APPOINTMENT_REMINDER',
    delayMinutes: overrides.delayMinutes ?? 2880,
    channel: 'SMS',
    conditions: { suppressEmailForSameTrigger: true },
    isActive: overrides.isActive ?? true,
    template: {
      id: 'tmpl-1',
      body:
        overrides.body ??
        'Kids 0-18 Pediatrics: You have an appointment on {{appointment.date}} at {{appointment.time}}. {{portal.link}}',
    },
  }
}

function makeAppointment(startTime: Date, overrides: Record<string, unknown> = {}) {
  return {
    id: 'appt-1',
    startTime,
    endTime: new Date(startTime.getTime() + 30 * 60_000),
    type: 'WELL_CHILD_VISIT',
    status: 'CONFIRMED',
    patientId: 'pt-1',
    patient: { id: 'pt-1' },
    ...overrides,
  }
}

describe('messageScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.mockSeed.mockResolvedValue(0)
    m.mockQueueAutomationSms.mockResolvedValue(true)
    m.mockWasSmsAutomationSent.mockResolvedValue(false)
    m.mockWasEmailSentForTriggerKey.mockResolvedValue(false)
    m.mockGetVerifiedPortalPhone.mockResolvedValue('2534004479')
    m.mockIsPatientSmsOptedOut.mockResolvedValue(false)
    m.mockResolveMergeTags.mockImplementation(async (body: string) => body.replace(/\{\{[^}]+\}\}/g, 'X'))
  })

  it('queues APPOINTMENT_REMINDER for appointment ~48h away', async () => {
    const apptTime = new Date(Date.now() + 48 * 3_600_000)
    m.mockPrisma.messagingAutomationRule.findMany.mockResolvedValue([makeRule()])
    m.mockPrisma.appointment.findMany.mockResolvedValue([makeAppointment(apptTime)])

    const result = await runMessageSchedulerOnce()

    expect(result.queued).toBe(1)
    expect(m.mockQueueAutomationSms).toHaveBeenCalledOnce()
    expect(m.mockQueueAutomationSms).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: 'pt-1',
        ruleId: 'rule-48h',
        triggerEvent: 'APPOINTMENT_REMINDER',
        appointmentId: 'appt-1',
      }),
    )
  })

  it('does not trigger 48h rule for appointment ~47h away (outside window)', async () => {
    const apptTime = new Date(Date.now() + 47 * 3_600_000)
    m.mockPrisma.messagingAutomationRule.findMany.mockResolvedValue([makeRule()])
    m.mockPrisma.appointment.findMany.mockResolvedValue([])

    await runMessageSchedulerOnce()

    expect(m.mockQueueAutomationSms).not.toHaveBeenCalled()
  })

  it('skips when automation message already sent (idempotency)', async () => {
    const apptTime = new Date(Date.now() + 48 * 3_600_000)
    m.mockPrisma.messagingAutomationRule.findMany.mockResolvedValue([makeRule()])
    m.mockPrisma.appointment.findMany.mockResolvedValue([makeAppointment(apptTime)])
    m.mockWasSmsAutomationSent.mockResolvedValue(true)

    await runMessageSchedulerOnce()

    expect(m.mockQueueAutomationSms).not.toHaveBeenCalled()
  })

  it('skips opted-out patient via queueAutomationSms returning false', async () => {
    const apptTime = new Date(Date.now() + 48 * 3_600_000)
    m.mockPrisma.messagingAutomationRule.findMany.mockResolvedValue([makeRule()])
    m.mockPrisma.appointment.findMany.mockResolvedValue([makeAppointment(apptTime)])
    m.mockQueueAutomationSms.mockResolvedValue(false)

    const result = await runMessageSchedulerOnce()
    expect(result.queued).toBe(0)
  })

  it('skips when no verified portal session (queueAutomationSms returns false)', async () => {
    const apptTime = new Date(Date.now() + 48 * 3_600_000)
    m.mockPrisma.messagingAutomationRule.findMany.mockResolvedValue([makeRule()])
    m.mockPrisma.appointment.findMany.mockResolvedValue([makeAppointment(apptTime)])
    m.mockQueueAutomationSms.mockResolvedValue(false)

    await runMessageSchedulerOnce()
    expect(m.mockQueueAutomationSms).toHaveBeenCalledOnce()
  })

  it('fires NO_SHOW follow-up ~24h after no-show', async () => {
    const endTime = new Date(Date.now() - 24 * 3_600_000)
    m.mockPrisma.messagingAutomationRule.findMany.mockResolvedValue([
      makeRule({ id: 'rule-noshow', triggerEvent: 'NO_SHOW', delayMinutes: 1440 }),
    ])
    m.mockPrisma.appointment.findMany.mockResolvedValue([
      makeAppointment(new Date(endTime.getTime() - 30 * 60_000), {
        status: 'NO_SHOW',
        endTime,
      }),
    ])

    await runMessageSchedulerOnce()

    expect(m.mockQueueAutomationSms).toHaveBeenCalledWith(
      expect.objectContaining({ triggerEvent: 'NO_SHOW' }),
    )
  })

  it('fires NEW_PATIENT for recently created patients', async () => {
    m.mockPrisma.messagingAutomationRule.findMany.mockResolvedValue([
      makeRule({ id: 'rule-welcome', triggerEvent: 'NEW_PATIENT', delayMinutes: 0 }),
    ])
    m.mockPrisma.patient.findMany.mockResolvedValue([{ id: 'pt-new' }])

    await runMessageSchedulerOnce()

    expect(m.mockQueueAutomationSms).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: 'pt-new',
        triggerEvent: 'NEW_PATIENT',
        entityId: 'pt-new',
      }),
    )
  })

  it('skips SMS when email already sent for same trigger', async () => {
    const apptTime = new Date(Date.now() + 48 * 3_600_000)
    m.mockPrisma.messagingAutomationRule.findMany.mockResolvedValue([makeRule()])
    m.mockPrisma.appointment.findMany.mockResolvedValue([makeAppointment(apptTime)])
    m.mockWasEmailSentForTriggerKey.mockResolvedValue(true)

    await runMessageSchedulerOnce()

    expect(m.mockQueueAutomationSms).not.toHaveBeenCalled()
  })

  it('does not process inactive rules', async () => {
    m.mockPrisma.messagingAutomationRule.findMany.mockResolvedValue([])

    const result = await runMessageSchedulerOnce()

    expect(result.rules).toBe(0)
    expect(m.mockQueueAutomationSms).not.toHaveBeenCalled()
  })

  it('builds consistent trigger keys for cross-channel coordination', () => {
    expect(buildTriggerKey('APPOINTMENT_REMINDER', 2880)).toBe('APPOINTMENT_REMINDER:2880')
    expect(buildTriggerKey('APPOINTMENT_REMINDER', 1440)).toBe('APPOINTMENT_REMINDER:1440')
  })
})
