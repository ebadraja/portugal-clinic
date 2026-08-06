import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const GCM_PREFIX = 'gcm:v1:'
const GCM_ALGORITHM = 'aes-256-gcm'
const GCM_IV_LENGTH = 12
const KEY_SALT = 'kids018-crm-v1'

function encryptionSecret(): string {
  return (
    process.env.MESSAGING_ENCRYPTION_KEY ||
    process.env.ENCRYPTION_SECRET ||
    'default-secret-key'
  )
}

function deriveKey(): Buffer {
  return scryptSync(encryptionSecret(), KEY_SALT, 32)
}

/** Legacy XOR obfuscation — kept for decrypting existing stored values. */
function legacyEncrypt(value: string): string {
  const secret = process.env.ENCRYPTION_SECRET || 'default-secret-key'
  let out = ''
  for (let i = 0; i < value.length; i++) {
    out += String.fromCharCode(value.charCodeAt(i) ^ secret.charCodeAt(i % secret.length))
  }
  return Buffer.from(out).toString('base64')
}

function legacyDecrypt(encoded: string): string {
  try {
    const secret = process.env.ENCRYPTION_SECRET || 'default-secret-key'
    const raw = Buffer.from(encoded, 'base64').toString()
    let out = ''
    for (let i = 0; i < raw.length; i++) {
      out += String.fromCharCode(raw.charCodeAt(i) ^ secret.charCodeAt(i % secret.length))
    }
    return out
  } catch {
    return ''
  }
}

function gcmEncrypt(value: string): string {
  const iv = randomBytes(GCM_IV_LENGTH)
  const cipher = createCipheriv(GCM_ALGORITHM, deriveKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const payload = Buffer.concat([iv, tag, encrypted]).toString('base64')
  return `${GCM_PREFIX}${payload}`
}

function gcmDecrypt(encoded: string): string {
  const payload = encoded.slice(GCM_PREFIX.length)
  const data = Buffer.from(payload, 'base64')
  const iv = data.subarray(0, GCM_IV_LENGTH)
  const tag = data.subarray(GCM_IV_LENGTH, GCM_IV_LENGTH + 16)
  const ciphertext = data.subarray(GCM_IV_LENGTH + 16)
  const decipher = createDecipheriv(GCM_ALGORITHM, deriveKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

/** Encrypt with AES-256-GCM (new values). Use for message content and new PHI fields. */
export function encrypt(value: string): string {
  return gcmEncrypt(value)
}

/**
 * Decrypt a stored value. Supports AES-256-GCM (`gcm:v1:` prefix) and legacy XOR
 * ciphertext already in the database (email addresses, OAuth tokens, etc.).
 */
export function decrypt(encoded: string): string {
  if (!encoded) return ''
  if (encoded.startsWith(GCM_PREFIX)) {
    try {
      return gcmDecrypt(encoded)
    } catch {
      return ''
    }
  }
  return legacyDecrypt(encoded)
}

/** Explicit AES-256-GCM encrypt — alias used by messaging module code paths. */
export function encryptMessage(value: string): string {
  return gcmEncrypt(value)
}

/** Explicit AES-256-GCM decrypt for message content. */
export function decryptMessage(encoded: string): string {
  if (!encoded.startsWith(GCM_PREFIX)) return ''
  try {
    return gcmDecrypt(encoded)
  } catch {
    return ''
  }
}

/** @internal Test-only: produce legacy XOR ciphertext for backward-compat tests. */
export function legacyEncryptForTest(value: string): string {
  return legacyEncrypt(value)
}
