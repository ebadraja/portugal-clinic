import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  recordWebhookEvent: vi.fn(),
  processVapiEndOfCall: vi.fn(),
  runVoiceTool: vi.fn(),
  getClinicSettings: vi.fn(),
}))

vi.mock('@/lib/voice/webhookLog', () => ({ recordWebhookEvent: m.recordWebhookEvent }))
vi.mock('@/lib/voice/endOfCall', () => ({ processVapiEndOfCall: m.processVapiEndOfCall }))
vi.mock('@/lib/voice/tools', () => ({ runVoiceTool: m.runVoiceTool }))
vi.mock('@/lib/clinic/settings', () => ({ getClinicSettings: m.getClinicSettings }))

import { POST } from '@/app/api/webhooks/vapi/route'

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/webhooks/vapi', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } })

const SECRET = { 'x-vapi-secret': 'test-secret' }
const original = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.VAPI_WEBHOOK_SECRET = 'test-secret'
  m.getClinicSettings.mockResolvedValue({ voiceAgent: { paused: false } })
})
afterEach(() => {
  process.env = { ...original }
})

describe('POST /api/webhooks/vapi', () => {
  it('refuses all deliveries when the secret is not configured', async () => {
    delete process.env.VAPI_WEBHOOK_SECRET
    const res = await POST(post({ message: { type: 'tool-calls', toolCallList: [] } }, SECRET))
    expect(res.status).toBe(503)
    expect(m.runVoiceTool).not.toHaveBeenCalled()
    expect(m.recordWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'rejected', reason: 'secret_not_configured' }))
  })

  it('refuses a wrong secret with 401 and records it', async () => {
    const res = await POST(post({ message: { type: 'end-of-call-report' } }, { 'x-vapi-secret': 'nope' }))
    expect(res.status).toBe(401)
    expect(m.processVapiEndOfCall).not.toHaveBeenCalled()
    expect(m.recordWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'rejected', reason: 'bad_credential' }))
  })

  it('dispatches tool calls with the server-side caller ID', async () => {
    m.runVoiceTool.mockResolvedValue('ok')
    const res = await POST(post({
      message: {
        type: 'tool-calls',
        call: { id: 'call-9', customer: { number: '+351912345678' } },
        toolCallList: [{ id: 'tc1', function: { name: 'check_availability', arguments: '{"date":"2026-10-19"}' } }],
      },
    }, SECRET))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ results: [{ toolCallId: 'tc1', result: 'ok' }] })
    const [name, args, ctx] = m.runVoiceTool.mock.calls[0]
    expect(name).toBe('check_availability')
    expect(args).toEqual({ date: '2026-10-19' })
    expect(ctx).toMatchObject({ callId: 'call-9', callerPhone: '+351912345678' })
  })

  it('a failing tool returns a safe sentence, not an error', async () => {
    m.runVoiceTool.mockRejectedValue(new Error('db down'))
    const res = await POST(post({ message: { type: 'tool-calls', call: { id: 'c' }, toolCallList: [{ id: 'tc1', function: { name: 'book_appointment', arguments: '{}' } }] } }, SECRET))
    const json = await res.json()
    expect(json.results[0].result).toMatch(/chamada de volta/)
  })

  it('files an end-of-call report once; a duplicate is acknowledged', async () => {
    m.processVapiEndOfCall.mockResolvedValueOnce({ callLogId: 'cl1' })
    const r1 = await POST(post({ message: { type: 'end-of-call-report', call: { id: 'call-1' } } }, SECRET))
    expect(r1.status).toBe(201)
    m.processVapiEndOfCall.mockResolvedValueOnce({ callLogId: 'cl1', alreadyExists: true })
    const r2 = await POST(post({ message: { type: 'end-of-call-report', call: { id: 'call-1' } } }, SECRET))
    expect(r2.status).toBe(200)
    expect((await r2.json()).reason).toBe('duplicate')
    expect(m.recordWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'duplicate', callId: 'call-1' }))
  })

  it('processing failure returns 500 so Vapi retries, and is recorded', async () => {
    m.processVapiEndOfCall.mockRejectedValue(new Error('boom'))
    const res = await POST(post({ message: { type: 'end-of-call-report', call: { id: 'call-2' } } }, SECRET))
    expect(res.status).toBe(500)
    expect(m.recordWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'error', callId: 'call-2' }))
  })

  it('never logs the payload body', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    m.processVapiEndOfCall.mockResolvedValue({ callLogId: 'x' })
    await POST(post({ message: { type: 'end-of-call-report', call: { id: 'c3' }, transcript: 'SECRET-TRANSCRIPT Maria nasceu em 1985' } }, SECRET))
    const printed = log.mock.calls.flat().join(' ')
    expect(printed).not.toMatch(/SECRET-TRANSCRIPT|1985/)
    log.mockRestore()
  })

  it('rejects invalid JSON', async () => {
    const res = await POST(post('{not json', SECRET))
    expect(res.status).toBe(400)
  })
})
