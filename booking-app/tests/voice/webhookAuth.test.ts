import { describe, it, expect } from 'vitest'
import { extractCredential, safeEqual, verifyVapiRequest } from '@/lib/voice/webhookAuth'

const h = (init: Record<string, string>) => new Headers(init)

describe('verifyVapiRequest — fails closed', () => {
  it('refuses everything when no secret is configured (production)', () => {
    expect(verifyVapiRequest(h({ 'x-vapi-secret': 'anything' }), { NODE_ENV: 'production' })).toEqual({ ok: false, status: 503, reason: 'secret_not_configured' })
  })

  it('refuses when no secret is configured in development unless explicitly allowed', () => {
    expect(verifyVapiRequest(h({}), { NODE_ENV: 'development' })).toMatchObject({ ok: false, status: 503 })
    expect(verifyVapiRequest(h({}), { NODE_ENV: 'development', VAPI_ALLOW_UNSIGNED: 'true' })).toEqual({ ok: true, mode: 'unsigned-dev' })
  })

  it('ignores the dev escape hatch in production', () => {
    expect(verifyVapiRequest(h({}), { NODE_ENV: 'production', VAPI_ALLOW_UNSIGNED: 'true' })).toMatchObject({ ok: false, status: 503 })
  })

  it('treats a blank secret as not configured', () => {
    expect(verifyVapiRequest(h({ 'x-vapi-secret': '' }), { NODE_ENV: 'production', VAPI_WEBHOOK_SECRET: '   ' })).toMatchObject({ ok: false, status: 503 })
  })

  it('accepts the x-vapi-secret header', () => {
    expect(verifyVapiRequest(h({ 'x-vapi-secret': 's3cret' }), { VAPI_WEBHOOK_SECRET: 's3cret' })).toEqual({ ok: true, mode: 'signed' })
  })

  it('accepts Authorization: Bearer', () => {
    expect(verifyVapiRequest(h({ authorization: 'Bearer s3cret' }), { VAPI_WEBHOOK_SECRET: 's3cret' })).toEqual({ ok: true, mode: 'signed' })
  })

  it('rejects a missing or wrong credential with 401', () => {
    expect(verifyVapiRequest(h({}), { VAPI_WEBHOOK_SECRET: 's3cret' })).toEqual({ ok: false, status: 401, reason: 'missing_credential' })
    expect(verifyVapiRequest(h({ 'x-vapi-secret': 's3cret!' }), { VAPI_WEBHOOK_SECRET: 's3cret' })).toEqual({ ok: false, status: 401, reason: 'bad_credential' })
    expect(verifyVapiRequest(h({ 'x-vapi-secret': 's3cre' }), { VAPI_WEBHOOK_SECRET: 's3cret' })).toMatchObject({ ok: false, reason: 'bad_credential' })
  })

  it('constant-time compare handles different lengths', () => {
    expect(safeEqual('a', 'a')).toBe(true)
    expect(safeEqual('a', 'ab')).toBe(false)
  })

  it('prefers x-vapi-secret over Authorization', () => {
    expect(extractCredential(h({ 'x-vapi-secret': 'one', authorization: 'Bearer two' }))).toBe('one')
    expect(extractCredential(h({ authorization: 'Basic xyz' }))).toBe(null)
  })
})
