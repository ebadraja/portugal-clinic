import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

// ── Shared mock state (vi.hoisted runs before vi.mock factories) ───────────────

const m = vi.hoisted(() => {
  const capturedProcessor = { current: null as ((job: unknown) => Promise<void>) | null }
  const capturedHandlers: Record<string, (job: unknown, err?: Error) => Promise<void>> = {}

  const mockSendMail = vi.fn()
  const mockQueueAdd = vi.fn()

  const mockPrisma = {
    emailLog: {
      create:              vi.fn(),
      update:              vi.fn(),
      findFirst:           vi.fn(),
      findMany:            vi.fn(),
      findUnique:          vi.fn(),
      createManyAndReturn: vi.fn(),
    },
    unsubscribe:     { findUnique: vi.fn(), findMany: vi.fn() },
    emailTemplate:   { findUnique: vi.fn() },
    emailCampaign:   { findUnique: vi.fn(), update: vi.fn() },
    user:            { findMany: vi.fn() },
    notification:    { create: vi.fn() },
    settings:        { findFirst: vi.fn().mockResolvedValue(null) },
  }

  const mockResolveMergeTags = vi.fn()

  return { capturedProcessor, capturedHandlers, mockSendMail, mockQueueAdd, mockPrisma, mockResolveMergeTags }
})

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('bullmq', () => ({
  // Must use regular functions (not arrows) so they can be called with `new`
  Queue: vi.fn(function Queue() {
    return { add: m.mockQueueAdd, addBulk: vi.fn() }
  }),
  Worker: vi.fn(function Worker(_name: string, processor: (job: unknown) => Promise<void>) {
    m.capturedProcessor.current = processor
    return {
      on: vi.fn(function on(event: string, handler: (j: unknown, e?: Error) => Promise<void>) {
        m.capturedHandlers[event] = handler
      }),
    }
  }),
  Job: class {},
}))

vi.mock('@/lib/prisma', () => ({ prisma: m.mockPrisma }))

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: m.mockSendMail })),
  },
}))

vi.mock('@sendgrid/mail', () => ({
  default: { setApiKey: vi.fn(), send: vi.fn() },
}))

vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn(() => 'recipient@example.com'),
  encrypt: vi.fn((v: string) => Buffer.from(v).toString('base64')),
}))

vi.mock('@/lib/email/mergeTags', () => ({
  resolveMergeTags: m.mockResolveMergeTags,
}))

// ── Import after mocks ────────────────────────────────────────────────────────

import { queueTransactionalEmail, startWorker, type EmailJobData } from '@/services/emailQueue'

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<EmailJobData> & { emailLogId?: string } = {}) {
  return {
    id: 'job-test',
    attemptsMade: 0,
    opts: { attempts: 3 },
    data: {
      patientId:  'pt-1',
      templateId: 'tmpl-1',
      variables:  {},
      toEmail:    'encrypted-value',
      emailLogId: 'log-1',
      ...overrides,
    } as EmailJobData,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('emailQueue', () => {
  beforeAll(() => {
    // startWorker registers processEmailJob via the Worker constructor mock
    startWorker()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // Restore safe defaults after clearing
    m.mockSendMail.mockResolvedValue({})
    m.mockPrisma.emailLog.update.mockResolvedValue({})
    m.mockPrisma.emailLog.create.mockResolvedValue({ id: 'log-1' })
    m.mockPrisma.user.findMany.mockResolvedValue([])
    m.mockPrisma.notification.create.mockResolvedValue({})
    m.mockResolveMergeTags.mockResolvedValue({
      subject: 'Test Subject',
      html:    '<p>Hello</p>',
      plain:   'Hello',
    })
  })

  // ── Test 1 ────────────────────────────────────────────────────────────────

  it('queueTransactionalEmail creates a QUEUED log row and enqueues the job', async () => {
    m.mockPrisma.emailLog.create.mockResolvedValue({ id: 'log-42' })
    m.mockQueueAdd.mockResolvedValue({ id: 'bull-job-42' })

    const jobId = await queueTransactionalEmail('pt-1', 'tmpl-1', {}, 'encrypted-email')

    expect(m.mockPrisma.emailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patientId:  'pt-1',
        templateId: 'tmpl-1',
        status:     'QUEUED',
        type:       'AUTOMATED',
      }),
    })

    expect(m.mockQueueAdd).toHaveBeenCalledWith(
      'send-email',
      expect.objectContaining({ patientId: 'pt-1', templateId: 'tmpl-1', emailLogId: 'log-42' }),
      expect.anything(),
    )

    expect(jobId).toBe('bull-job-42')
  })

  // ── Test 2 ────────────────────────────────────────────────────────────────

  it('processEmailJob marks the log as SENT on successful delivery', async () => {
    m.mockPrisma.unsubscribe.findUnique.mockResolvedValue(null)
    m.mockPrisma.emailTemplate.findUnique.mockResolvedValue({
      id: 'tmpl-1', subject: 'Reminder', htmlBody: '<p>Hi</p>', isActive: true,
    })

    await m.capturedProcessor.current!(makeJob())

    expect(m.mockSendMail).toHaveBeenCalledOnce()
    expect(m.mockPrisma.emailLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data:  expect.objectContaining({ status: 'SENT', sentAt: expect.any(Date) }),
    })
  })

  // ── Test 3 ────────────────────────────────────────────────────────────────

  it('failed handler marks the log as FAILED after all retries are exhausted', async () => {
    const job = makeJob({ emailLogId: 'log-perm-fail' })
    job.attemptsMade = 3 // same as opts.attempts → willRetry = false

    await m.capturedHandlers['failed'](job, new Error('SMTP connection refused'))

    expect(m.mockPrisma.emailLog.update).toHaveBeenCalledWith({
      where: { id: 'log-perm-fail' },
      data:  expect.objectContaining({
        status:       'FAILED',
        errorMessage: 'SMTP connection refused',
      }),
    })
  })

  // ── Test 4 ────────────────────────────────────────────────────────────────

  it('processEmailJob skips sending and marks log UNSUBSCRIBED for opted-out patients', async () => {
    m.mockPrisma.unsubscribe.findUnique.mockResolvedValue({ patientId: 'pt-1' })

    await m.capturedProcessor.current!(makeJob())

    expect(m.mockSendMail).not.toHaveBeenCalled()
    expect(m.mockPrisma.emailLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data:  { status: 'UNSUBSCRIBED' },
    })
  })
})
