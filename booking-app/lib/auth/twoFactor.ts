/**
 * Two-factor (TOTP) verification for a stored user. The secret is kept
 * encrypted with lib/crypto.ts; each accepted code's time-step is recorded so
 * the same code can't be used twice.
 */
import prisma from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { verifyTotp } from '@/lib/auth/totp'

export function readSecret(stored: string | null | undefined): string | null {
  if (!stored) return null
  try {
    const s = decrypt(stored)
    return /^[A-Z2-7]{16,}$/.test(s) ? s : null
  } catch {
    return null
  }
}

/**
 * Verifies `code` for the user and atomically records its step.
 * Returns true only for a valid, not-yet-used code.
 */
export async function consumeTotpCode(user: { id: string; twoFactorSecret: string | null; twoFactorLastStep: number | null }, code: unknown): Promise<boolean> {
  if (typeof code !== 'string') return false
  const secret = readSecret(user.twoFactorSecret)
  if (!secret) return false
  const step = verifyTotp(secret, code, { lastUsedStep: user.twoFactorLastStep })
  if (step === null) return false
  // Conditional update: two simultaneous logins with the same code — only one wins.
  const res = await prisma.user.updateMany({
    where: { id: user.id, OR: [{ twoFactorLastStep: null }, { twoFactorLastStep: { lt: step } }] },
    data: { twoFactorLastStep: step },
  })
  return res.count === 1
}
