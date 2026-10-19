import { describe, it, expect } from 'vitest'
import { allowedRecordingHosts, isAllowedRecordingUrl, isPlaybackStart, parseRangeHeader } from '@/lib/voice/recordingProxy'

describe('recording host allowlist (SSRF guard)', () => {
  const hosts = allowedRecordingHosts({})

  it.each([
    'https://storage.vapi.ai/abc-mono.wav',
    'https://vapi.ai/x.wav',
  ])('allows %s', (url) => {
    expect(isAllowedRecordingUrl(url, hosts)).toBe(true)
  })

  it.each([
    'http://storage.vapi.ai/abc.wav', // not https
    'https://evilvapi.ai/abc.wav', // suffix trick
    'https://vapi.ai.evil.com/abc.wav',
    'https://169.254.169.254/latest/meta-data',
    'https://user:pass@storage.vapi.ai/x.wav',
    'not a url',
  ])('refuses %s', (url) => {
    expect(isAllowedRecordingUrl(url, hosts)).toBe(false)
  })

  it('can be extended by env', () => {
    const extended = allowedRecordingHosts({ VOICE_RECORDING_HOSTS: 'recordings.example.com, ' })
    expect(isAllowedRecordingUrl('https://recordings.example.com/a.mp3', extended)).toBe(true)
  })
})

describe('Range parsing', () => {
  it.each([
    ['bytes=0-', 1000, { start: 0, end: 999 }],
    ['bytes=0-1', 1000, { start: 0, end: 1 }],
    ['bytes=500-1999', 1000, { start: 500, end: 999 }],
    ['bytes=-100', 1000, { start: 900, end: 999 }],
  ])('%s of %d', (header, size, expected) => {
    expect(parseRangeHeader(header, size)).toEqual(expected)
  })

  it('unsatisfiable and unsupported ranges', () => {
    expect(parseRangeHeader('bytes=1000-', 1000)).toBe('unsatisfiable')
    expect(parseRangeHeader('bytes=-0', 1000)).toBe('unsatisfiable')
    expect(parseRangeHeader('bytes=0-1,5-6', 1000)).toBe(null)
    expect(parseRangeHeader(null, 1000)).toBe(null)
  })

  it('audits only the start of a playback', () => {
    expect(isPlaybackStart(null)).toBe(true)
    expect(isPlaybackStart('bytes=0-')).toBe(true)
    expect(isPlaybackStart('bytes=65536-')).toBe(false)
  })
})
