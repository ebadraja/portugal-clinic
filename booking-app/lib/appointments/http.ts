/**
 * HTTP helpers shared by the staff appointment routes (legacy /api/appointments and /api/agenda).
 */
import { NextResponse } from 'next/server'
import type { StaffUser } from '@/lib/auth/guards'
import type { Actor, BookingFailure } from '@/lib/appointments/booking'

export function staffActor(user: StaffUser): Actor {
  return { kind: 'STAFF', userId: user.id, role: user.role }
}

const STATUS: Record<BookingFailure['code'], number> = {
  forbidden: 403,
  not_found: 404,
  invalid: 400,
  slot: 409,
  // The user must confirm the warnings (outside hours, blocked time…) and send again.
  needs_confirmation: 422,
}

export function bookingFailureResponse(r: BookingFailure): NextResponse {
  return NextResponse.json(
    { error: r.message, code: r.code, reason: r.reason ?? null, issues: r.issues ?? [] },
    { status: STATUS[r.code] },
  )
}
