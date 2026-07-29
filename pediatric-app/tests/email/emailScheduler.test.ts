import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared mock state ─────────────────────────────────────────────────────────

const m = vi.hoisted(() => {
  const mockQueueTransactionalEmail = vi.fn()
  const mockQueueCampaignBatch      = vi.fn()

  const mockPrisma = {
    emailAutomationRule: { findMany: vi.fn() },
    appointment:         { findMany: vi.fn() },
    emailLog:            { findFirst: vi.fn(), create: vi.fn() },
    emailCampaign:       { findMany: vi.fn(), update: vi.fn() },
    patient:             { findMany: vi.fn() },
    unsubscribe:         { findMany: vi.fn() },
  }

  return { mockQueueTransactionalEmail, mockQueueCampaignBatch, mockPrisma }
})

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/prisma', () => ({ prisma: m.mockPrisma }))

vi.mock('@/services/emailQueue', () => ({
  queueTransactionalEmail: m.mockQueueTransactionalEmail,
  queueCampaignBatch:      m.mockQueueCampaignBatch,
}))

vi.mock('@/lib/crypto', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
}))

vi.mock('@/lib/messaging/automationCoordination', () => ({
  emailOffsetToTriggerKey: (event: string, hours: number) =>
    event === 'X_DAYS_BEFORE'
      ? `APPOINTMENT_REMINDER:${Math.abs(hours) * 60}`
      : `POST_VISIT:${Math.abs(hours) * 60}`,
  wasSmsSentForTriggerKey: vi.fn().mockResolvedValue(false),
}))

// ── Import after mocks ────────────────────────────────────────────────────────

import { runSchedulerOnce } from '@/services/emailScheduler'

// ── Shared test data ──────────────────────────────────────────────────────────

function makePatient(overrides: Record<string, unknown> = {}) {
  return {
    id:          'pt-1',
    firstName:   'Alex',
    lastName:    'Smith',
    parentName:  'Jane Smith',
    parentEmail: 'jane@example.com',
    email:       null,
    dateOfBirth: new Date('2020-01-01'),
    ...overrides,
  }
}

function makeAppointment(startTime: Date, overrides: Record<string, unknown> = {}) {
  return {
    id:        'appt-1',
    startTime,
    type:      'WELL_CHILD_VISIT',
    provider:  'Dr. Tamas',
    reason:    null,
    status:    'CONFIRMED',
    patient:   makePatient(),
    ...overrides,
  }
}

function makeRule(offsetHours: number, overrides: Record<string, unknown> = {}) {
  return {
    id:                 `rule-${offsetHours}h`,
    name:               `${Math.abs(offsetHours)}h reminder`,
    triggerEvent:       'X_DAYS_BEFORE',
    triggerOffsetHours: offsetHours,
    isActive:           true,
    templateId:         'tmpl-1',
    template:           { id: 'tmpl-1', isActive: true },
    conditions:         null,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('emailScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.mockQueueTransactionalEmail.mockResolvedValue('job-id')
    m.mockQueueCampaignBatch.mockResolvedValue(undefined)
    // Default: no scheduled campaigns due
    m.mockPrisma.emailCampaign.findMany.mockResolvedValue([])
  })

  // ── Test 1 ────────────────────────────────────────────────────────────────

  it('queues a 48-hour reminder for an eligible upcoming appointment', async () => {
    const apptTime = new Date(Date.now() + 48 * 3_600_000)

    m.mockPrisma.emailAutomationRule.findMany.mockResolvedValue([makeRule(-48)])
    m.mockPrisma.appointment.findMany.mockResolvedValue([makeAppointment(apptTime)])
    m.mockPrisma.emailLog.findFirst.mockResolvedValue(null) // not already sent
    m.mockPrisma.emailLog.create.mockResolvedValue({ id: 'log-new' })

    await runSchedulerOnce()

    expect(m.mockQueueTransactionalEmail).toHaveBeenCalledOnce()
    const [patientId, templateId] = m.mockQueueTransactionalEmail.mock.calls[0]
    expect(patientId).toBe('pt-1')
    expect(templateId).toBe('tmpl-1')
  })

  // ── Test 2 ────────────────────────────────────────────────────────────────

  it('does not re-queue a reminder that has already been sent (idempotency)', async () => {
    const apptTime = new Date(Date.now() + 48 * 3_600_000)

    m.mockPrisma.emailAutomationRule.findMany.mockResolvedValue([makeRule(-48)])
    m.mockPrisma.appointment.findMany.mockResolvedValue([makeAppointment(apptTime)])
    // Simulate that this reminder was already queued
    m.mockPrisma.emailLog.findFirst.mockResolvedValue({
      id: 'log-existing', status: 'SENT',
    })

    await runSchedulerOnce()

    expect(m.mockQueueTransactionalEmail).not.toHaveBeenCalled()
  })

  // ── Test 3 ────────────────────────────────────────────────────────────────

  it('schedules email 7 days before the appointment for a -168h rule (Develo link)', async () => {
    const apptTime       = new Date('2026-06-12T10:00:00.000Z')
    const expectedSendAt = new Date(apptTime.getTime() - 168 * 3_600_000) // 7 days before

    m.mockPrisma.emailAutomationRule.findMany.mockResolvedValue([makeRule(-168)])
    m.mockPrisma.appointment.findMany.mockResolvedValue([makeAppointment(apptTime)])
    m.mockPrisma.emailLog.findFirst.mockResolvedValue(null)
    m.mockPrisma.emailLog.create.mockResolvedValue({ id: 'log-develo' })

    await runSchedulerOnce()

    expect(m.mockQueueTransactionalEmail).toHaveBeenCalledOnce()
    const sendAt: Date = m.mockQueueTransactionalEmail.mock.calls[0][4]
    expect(sendAt.getTime()).toBe(expectedSendAt.getTime())
  })

  // ── Test 4 ────────────────────────────────────────────────────────────────

  it('only sends NovoPsych email to appointments matching the visitType condition', async () => {
    const apptTime = new Date(Date.now() + 72 * 3_600_000)

    const rule = makeRule(-72, {
      conditions: { visitType: 'DEVELOPMENTAL_BEHAVIORAL' },
    })

    // Two appointments: one matching, one not
    const matchingAppt = makeAppointment(apptTime, {
      id:      'appt-match',
      type:    'DEVELOPMENTAL_BEHAVIORAL',
      patient: makePatient({ id: 'pt-match' }),
    })
    const wrongTypeAppt = makeAppointment(apptTime, {
      id:      'appt-wrong',
      type:    'WELL_CHILD_VISIT',
      patient: makePatient({ id: 'pt-wrong' }),
    })

    m.mockPrisma.emailAutomationRule.findMany.mockResolvedValue([rule])
    m.mockPrisma.appointment.findMany.mockResolvedValue([matchingAppt, wrongTypeAppt])
    m.mockPrisma.emailLog.findFirst.mockResolvedValue(null)
    m.mockPrisma.emailLog.create.mockResolvedValue({ id: 'log-novo' })

    await runSchedulerOnce()

    // Only the DEVELOPMENTAL_BEHAVIORAL appointment should trigger queueing
    expect(m.mockQueueTransactionalEmail).toHaveBeenCalledOnce()
    const [patientId] = m.mockQueueTransactionalEmail.mock.calls[0]
    expect(patientId).toBe('pt-match')
  })
})
