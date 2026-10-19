import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import type { Role } from '@/lib/generated/prisma/client'

/**
 * Handler-level authorisation for API routes.
 *
 * proxy.ts only redirects unauthenticated browsers; it is not authorisation.
 * Every staff route must call one of these itself.
 *
 *   const guard = await requireStaff({ write: true })
 *   if (!guard.ok) return guard.response
 *   const { user } = guard
 */

export type StaffUser = { id: string; role: Role; email: string; firstName: string; lastName: string }

export type GuardResult = { ok: true; user: StaffUser } | { ok: false; response: NextResponse }

export async function requireStaff(opts: { admin?: boolean; write?: boolean } = {}): Promise<GuardResult> {
  const session = await auth()
  const u = session?.user
  if (!u?.id) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (opts.admin && u.role !== 'ADMIN') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  // VIEWER is read-only.
  if (opts.write && u.role === 'VIEWER') {
    return { ok: false, response: NextResponse.json({ error: 'Your role is read-only' }, { status: 403 }) }
  }
  return {
    ok: true,
    user: {
      id: u.id,
      role: u.role,
      email: u.email ?? '',
      firstName: u.firstName ?? '',
      lastName: u.lastName ?? '',
    },
  }
}

export function requestMeta(req: Request): { ipAddress: string | null; userAgent: string | null } {
  return {
    ipAddress: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
  }
}
