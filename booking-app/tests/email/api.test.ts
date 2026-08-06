import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Shared mock state ─────────────────────────────────────────────────────────

const m = vi.hoisted(() => {
  const mockAuth = vi.fn()

  const mockPrisma = {
    emailTemplate:       { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    emailCampaign:       { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    emailLog:            { findMany: vi.fn() },
    emailAutomationRule: { findMany: vi.fn() },
    patient:             { findMany: vi.fn() },
    auditLog:            { create: vi.fn() },
    user:                { findMany: vi.fn() },
    notification:        { create: vi.fn() },
  }

  const mockQueueCampaignBatch = vi.fn()
  const mockPauseCampaign      = vi.fn()

  return { mockAuth, mockPrisma, mockQueueCampaignBatch, mockPauseCampaign }
})

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/auth',         () => ({ auth: m.mockAuth }))
vi.mock('@/lib/prisma',   () => ({ prisma: m.mockPrisma }))
vi.mock('@/lib/crypto',   () => ({
  encrypt: vi.fn((v: string) => Buffer.from(v).toString('base64')),
  decrypt: vi.fn((v: string) => Buffer.from(v, 'base64').toString()),
}))
vi.mock('@/services/emailQueue', () => ({
  queueCampaignBatch: m.mockQueueCampaignBatch,
  pauseCampaign:      m.mockPauseCampaign,
}))

// ── Import route handlers after mocks ─────────────────────────────────────────

import { POST as templatesPost }  from '@/app/api/email/templates/route'
import { POST as sendNowPost }    from '@/app/api/email/campaigns/[id]/send-now/route'
import { POST as pausePost }      from '@/app/api/email/campaigns/[id]/pause/route'
import { GET  as analyticsGet }   from '@/app/api/email/analytics/overview/route'

// ── Request helpers ───────────────────────────────────────────────────────────

function jsonRequest(url: string, body: unknown, method = 'POST'): NextRequest {
  return new NextRequest(url, {
    method,
    body:    JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function getRequest(url: string): NextRequest {
  return new NextRequest(url)
}

const ADMIN_SESSION = { user: { id: 'admin-1', role: 'ADMIN' } }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Email API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.mockAuth.mockResolvedValue(ADMIN_SESSION)
    m.mockPrisma.auditLog.create.mockResolvedValue({})
  })

  // ── Test 1: POST /api/email/templates ─────────────────────────────────────

  describe('POST /api/email/templates', () => {
    it('creates a template and returns 201 with the created object', async () => {
      const created = {
        id: 'tmpl-new', name: 'Welcome Email', type: 'TRANSACTIONAL',
        subject: 'Welcome!', htmlBody: '<p>Hi</p>', isActive: true,
        createdAt: new Date(), updatedAt: new Date(),
      }
      m.mockPrisma.emailTemplate.create.mockResolvedValue(created)

      const req = jsonRequest('http://localhost/api/email/templates', {
        name:     'Welcome Email',
        type:     'TRANSACTIONAL',
        subject:  'Welcome!',
        htmlBody: '<p>Hi there!</p>',
      })

      const res = await templatesPost(req)
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.id).toBe('tmpl-new')
      expect(body.name).toBe('Welcome Email')
      expect(m.mockPrisma.emailTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Welcome Email',
          type: 'TRANSACTIONAL',
          subject: 'Welcome!',
          isActive: true,
        }),
      })
    })

    it('returns 400 when required fields are missing', async () => {
      const req = jsonRequest('http://localhost/api/email/templates', {
        name: 'Incomplete',
        // missing type, subject, htmlBody
      })

      const res = await templatesPost(req)
      expect(res.status).toBe(400)
    })

    it('returns 400 for an invalid template type', async () => {
      const req = jsonRequest('http://localhost/api/email/templates', {
        name: 'Bad Type', type: 'INVALID_TYPE', subject: 'Hi', htmlBody: '<p>Hi</p>',
      })

      const res = await templatesPost(req)
      expect(res.status).toBe(400)
    })
  })

  // ── Test 2: POST /api/email/campaigns/:id/send-now ────────────────────────

  describe('POST /api/email/campaigns/:id/send-now', () => {
    it('queues the campaign and returns 200 with recipientCount', async () => {
      m.mockPrisma.emailCampaign.findUnique.mockResolvedValue({
        id: 'camp-1', status: 'DRAFT', templateId: 'tmpl-1', segmentFilters: {},
        template: { id: 'tmpl-1', isActive: true },
      })
      m.mockPrisma.patient.findMany.mockResolvedValue([
        { id: 'pt-1', firstName: 'Alex', lastName: 'Smith', parentName: 'Jane', parentEmail: 'jane@test.com', email: null },
        { id: 'pt-2', firstName: 'Leo',  lastName: 'Brown', parentName: 'Mark', parentEmail: 'mark@test.com', email: null },
      ])
      m.mockQueueCampaignBatch.mockResolvedValue(undefined)

      const req = jsonRequest('http://localhost/api/email/campaigns/camp-1/send-now', {})
      const res = await sendNowPost(req, { params: Promise.resolve({ id: 'camp-1' }) })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.message).toBe('Campaign queued')
      expect(body.recipientCount).toBe(2)
      expect(m.mockQueueCampaignBatch).toHaveBeenCalledWith(
        'camp-1',
        expect.arrayContaining([
          expect.objectContaining({ patientId: 'pt-1' }),
          expect.objectContaining({ patientId: 'pt-2' }),
        ]),
        'tmpl-1',
      )
    })

    it('returns 409 when campaign is already in SENDING status', async () => {
      m.mockPrisma.emailCampaign.findUnique.mockResolvedValue({
        id: 'camp-2', status: 'SENDING', templateId: 'tmpl-1', segmentFilters: {},
        template: { id: 'tmpl-1', isActive: true },
      })

      const req = jsonRequest('http://localhost/api/email/campaigns/camp-2/send-now', {})
      const res = await sendNowPost(req, { params: Promise.resolve({ id: 'camp-2' }) })
      expect(res.status).toBe(409)
    })
  })

  // ── Test 3: POST /api/email/campaigns/:id/pause ───────────────────────────

  describe('POST /api/email/campaigns/:id/pause', () => {
    it('pauses a SENDING campaign and returns 200', async () => {
      m.mockPrisma.emailCampaign.findUnique.mockResolvedValue({ status: 'SENDING' })
      m.mockPauseCampaign.mockResolvedValue(undefined)

      const req = jsonRequest('http://localhost/api/email/campaigns/camp-3/pause', {})
      const res = await pausePost(req, { params: Promise.resolve({ id: 'camp-3' }) })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.message).toBe('Campaign paused')
      expect(m.mockPauseCampaign).toHaveBeenCalledWith('camp-3')
    })

    it('returns 409 when campaign is in a non-pausable status', async () => {
      m.mockPrisma.emailCampaign.findUnique.mockResolvedValue({ status: 'SENT' })

      const req = jsonRequest('http://localhost/api/email/campaigns/camp-4/pause', {})
      const res = await pausePost(req, { params: Promise.resolve({ id: 'camp-4' }) })
      expect(res.status).toBe(409)
    })
  })

  // ── Test 4: GET /api/email/analytics/overview ─────────────────────────────

  describe('GET /api/email/analytics/overview', () => {
    it('returns a correct openRate based on OPENED + CLICKED / total sent', async () => {
      // 4 emails: 2 in SENT_SET only, 1 OPENED, 1 CLICKED
      // SENT_SET   = [SENT, DELIVERED, OPENED, CLICKED] → sentLogs = 4
      // OPENED_SET = [OPENED, CLICKED]                 → openedLogs = 2
      // openRate   = 2/4 * 100 = 50
      const baseLog = { sentAt: new Date(), createdAt: new Date(), templateId: null, campaignId: null, type: 'CAMPAIGN', template: null }
      const currentLogs = [
        { id: '1', status: 'SENT',      ...baseLog },
        { id: '2', status: 'DELIVERED', ...baseLog },
        { id: '3', status: 'OPENED',    ...baseLog },
        { id: '4', status: 'CLICKED',   ...baseLog },
      ]

      // findMany called twice: current period then previous period
      m.mockPrisma.emailLog.findMany
        .mockResolvedValueOnce(currentLogs)
        .mockResolvedValueOnce([]) // previous period — no data → change = 0

      m.mockPrisma.emailAutomationRule.findMany.mockResolvedValue([])
      m.mockPrisma.emailCampaign.findMany.mockResolvedValue([])

      const req = getRequest('http://localhost/api/email/analytics/overview')
      const res = await analyticsGet(req)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.kpis.totalSent).toBe(4)
      expect(body.kpis.openRate).toBe(50)
      // Click rate: 1 CLICKED / 4 sent = 25%
      expect(body.kpis.clickRate).toBe(25)
      // Bounce rate: 0 BOUNCED / 4 sent = 0%
      expect(body.kpis.bounceRate).toBe(0)
    })
  })
})
