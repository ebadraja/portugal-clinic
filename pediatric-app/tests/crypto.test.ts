import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  encrypt,
  decrypt,
  encryptMessage,
  decryptMessage,
  legacyEncryptForTest,
} from '@/lib/crypto'

describe('lib/crypto', () => {
  const originalSecret = process.env.ENCRYPTION_SECRET

  beforeEach(() => {
    process.env.ENCRYPTION_SECRET = 'test-encryption-secret-32chars!!'
    delete process.env.MESSAGING_ENCRYPTION_KEY
  })

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.ENCRYPTION_SECRET
    } else {
      process.env.ENCRYPTION_SECRET = originalSecret
    }
    delete process.env.MESSAGING_ENCRYPTION_KEY
  })

  it('encrypts with AES-256-GCM and decrypts round-trip', () => {
    const plaintext = 'Protected Health Information — patient message body'
    const ciphertext = encrypt(plaintext)

    expect(ciphertext).not.toBe(plaintext)
    expect(ciphertext.startsWith('gcm:v1:')).toBe(true)
    expect(decrypt(ciphertext)).toBe(plaintext)
  })

  it('produces unique ciphertext for the same plaintext (random IV)', () => {
    const plaintext = 'same input'
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext))
  })

  it('decrypts legacy XOR ciphertext for backward compatibility', () => {
    const plaintext = 'legacy@example.com'
    const legacy = legacyEncryptForTest(plaintext)

    expect(legacy.startsWith('gcm:v1:')).toBe(false)
    expect(decrypt(legacy)).toBe(plaintext)
  })

  it('encryptMessage and decryptMessage handle message content', () => {
    const body = 'Hello from the patient portal'
    const stored = encryptMessage(body)

    expect(stored.startsWith('gcm:v1:')).toBe(true)
    expect(decryptMessage(stored)).toBe(body)
  })

  it('decryptMessage returns empty string for legacy XOR values', () => {
    const legacy = legacyEncryptForTest('not a gcm message')
    expect(decryptMessage(legacy)).toBe('')
  })

  it('uses MESSAGING_ENCRYPTION_KEY when set', () => {
    process.env.MESSAGING_ENCRYPTION_KEY = 'dedicated-messaging-key-32chars!!'
    const ciphertext = encrypt('messaging-only')
    expect(decrypt(ciphertext)).toBe('messaging-only')
  })
})
