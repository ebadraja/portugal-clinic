import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import {
  advanceSessionToDobStep,
  attachSmsCodeToSession,
  completePortalVerification,
  createPendingPortalSession,
  findPatientByPhone,
  generateSmsCode,
  getPortalSessionByRawToken,
  isSameDateOfBirth,
  setPortalSessionCookie,
  parsePendingMeta,
  verifySmsCodeForSession,
} from '@/lib/messaging/portalAuth'
import { portalAuthBody } from '@/lib/messaging/portalSchemas'
import { getSmsProviderConfig } from '@/lib/messaging/smsSettings'
import { formatPhoneE164 } from '@/lib/messaging/smsProvider'
import { recordSmsConsent } from '@/lib/messaging/notifications-sms'
import { queueSms } from '@/services/messageQueue'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = portalAuthBody.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const payload = parsed.data

    if (payload.action === 'request_code') {
      const patient = await findPatientByPhone(payload.phone)
      if (!patient) {
        return NextResponse.json(
          { error: 'No patient found for this phone number. Please call the office.' },
          { status: 404 },
        )
      }

      // Record affirmative marketing/notification SMS consent if given. This is
      // optional — OTP codes below are transactional and sent regardless.
      if (payload.smsConsent) {
        try {
          await recordSmsConsent(patient.id, payload.phone)
        } catch (consentErr) {
          console.error('[portal] failed to record SMS consent:', (consentErr as Error).message)
        }
      }

      const code = generateSmsCode()
      const { rawToken, sessionId } = await createPendingPortalSession(patient.id, payload.phone)
      await attachSmsCodeToSession(sessionId, code)

      const smsConfig = await getSmsProviderConfig()
      if (smsConfig.sendOtpCodes) {
        let phoneE164: string
        try {
          phoneE164 = formatPhoneE164(payload.phone)
        } catch {
          return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
        }

        try {
          const jobId = await queueSms({
            to: phoneE164,
            body: `Your Kids 0-18 Pediatrics verification code is: ${code}`,
            type: 'otp',
            patientId: patient.id,
          })
          console.log(`[portal] OTP SMS queued patientId=${patient.id} jobId=${jobId}`)
        } catch (smsErr) {
          console.error('[portal] OTP SMS queue failed:', (smsErr as Error).message)
          return NextResponse.json(
            { error: 'Failed to send verification code. Please try again.' },
            { status: 500 },
          )
        }
      } else {
        console.log(`[portal] OTP SMS disabled in settings patientId=${patient.id}`)
      }

      const response: Record<string, string> = {
        sessionToken: rawToken,
        message: 'Verification code sent.',
      }

      if (process.env.NODE_ENV === 'development' && !smsConfig.sendOtpCodes) {
        response.devCode = code
      }

      return NextResponse.json(response)
    }

    if (payload.action === 'verify_code') {
      const session = await getPortalSessionByRawToken(payload.sessionToken)
      if (!session) {
        return NextResponse.json({ error: 'Session expired. Please start again.' }, { status: 401 })
      }

      const valid = await verifySmsCodeForSession(session.id, payload.code)
      if (!valid) {
        return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 })
      }

      await advanceSessionToDobStep(session.id)
      return NextResponse.json({ success: true, nextStep: 'dob' })
    }

    if (payload.action === 'verify_dob') {
      const session = await getPortalSessionByRawToken(payload.sessionToken)
      if (!session) {
        return NextResponse.json({ error: 'Session expired. Please start again.' }, { status: 401 })
      }

      const patient = await prisma.patient.findUnique({
        where: { id: session.patientId },
        select: { dateOfBirth: true },
      })
      if (!patient || !isSameDateOfBirth(patient.dateOfBirth, payload.dateOfBirth)) {
        return NextResponse.json({ error: 'Date of birth does not match our records' }, { status: 403 })
      }

      await completePortalVerification(session.id)
      await setPortalSessionCookie(payload.sessionToken)

      await prisma.auditLog.create({
        data: {
          action: 'PORTAL_ACCESS',
          entity: 'patient_portal',
          entityId: session.patientId,
        },
      })

      return NextResponse.json({ success: true, redirect: '/portal/chat' })
    }

    if (payload.action === 'magic_link_exchange') {
      const session = await getPortalSessionByRawToken(payload.token)
      if (!session) {
        return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
      }

      const meta = parsePendingMeta(session.deviceFingerprint)
      if (meta?.step === 'awaiting_code') {
        return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
      }

      const patient = await prisma.patient.findUnique({
        where: { id: session.patientId },
        select: { dateOfBirth: true },
      })
      if (!patient || !isSameDateOfBirth(patient.dateOfBirth, payload.dateOfBirth)) {
        return NextResponse.json({ error: 'Date of birth does not match our records' }, { status: 403 })
      }

      await completePortalVerification(session.id)
      await setPortalSessionCookie(payload.token)

      await prisma.auditLog.create({
        data: {
          action: 'PORTAL_ACCESS',
          entity: 'patient_portal',
          entityId: session.patientId,
        },
      })

      return NextResponse.json({ success: true, redirect: '/portal/chat' })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('[POST /api/portal/auth]', error)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}
