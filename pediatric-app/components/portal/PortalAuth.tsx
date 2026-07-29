'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Step = 'phone' | 'code' | 'dob'

export function PortalAuth() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [dob, setDob] = useState('')
  const [sessionToken, setSessionToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [reminderConsent, setReminderConsent] = useState(false)
  const [portalTextConsent, setPortalTextConsent] = useState(false)

  const phoneDigits = phone.replace(/\D/g, '')
  // SMS consent is optional — OTP verification codes are transactional and sent
  // regardless. Consent only gates marketing/notification texts.
  const canRequestCode = phoneDigits.length >= 10

  const requestCode = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/portal/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_code',
          phone,
          smsConsent: reminderConsent || portalTextConsent,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send code')
      setSessionToken(data.sessionToken)
      if (data.devCode) setDevCode(data.devCode)
      setStep('code')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const verifyCode = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/portal/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_code', sessionToken, code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Invalid code')
      setStep('dob')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const verifyDob = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/portal/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_dob', sessionToken, dateOfBirth: dob }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Verification failed')
      router.push(data.redirect ?? '/portal/chat')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">
          {step === 'phone' && 'Sign in to message your care team'}
          {step === 'code' && 'Enter verification code'}
          {step === 'dob' && 'Verify date of birth'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 'phone' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="phone">Mobile phone on file</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                placeholder="(555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Optional text message preferences
              </p>

              <label
                htmlFor="reminder-consent"
                className="flex items-start gap-3 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400"
              >
                <input
                  id="reminder-consent"
                  type="checkbox"
                  checked={reminderConsent}
                  onChange={(e) => setReminderConsent(e.target.checked)}
                  className="mt-0.5 h-5 w-5 min-h-[20px] min-w-[20px] shrink-0 rounded border-slate-300 accent-blue-600 cursor-pointer"
                />
                <span>
                  I agree to receive appointment reminders by text from Kids 0-18 Integrative
                  Pediatrics. Message frequency varies. Msg &amp; data rates may apply. Reply STOP
                  to opt out, HELP for help.
                </span>
              </label>

              <label
                htmlFor="portal-text-consent"
                className="flex items-start gap-3 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400"
              >
                <input
                  id="portal-text-consent"
                  type="checkbox"
                  checked={portalTextConsent}
                  onChange={(e) => setPortalTextConsent(e.target.checked)}
                  className="mt-0.5 h-5 w-5 min-h-[20px] min-w-[20px] shrink-0 rounded border-slate-300 accent-blue-600 cursor-pointer"
                />
                <span>
                  I agree to receive patient portal text notifications from Kids 0-18 Integrative
                  Pediatrics. Message frequency varies. Msg &amp; data rates may apply. Reply STOP
                  to opt out, HELP for help.
                </span>
              </label>

              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                These boxes are optional and are not required to receive your verification code.{' '}
                <a
                  href="https://www.kids0218.com/terms-and-conditions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Terms and Conditions
                </a>
                {' · '}
                <a
                  href="https://www.kids0218.com/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Privacy Policy
                </a>
              </p>
            </div>
            <Button
              type="button"
              className="w-full h-11"
              disabled={loading || !canRequestCode}
              onClick={() => void requestCode()}
            >
              {loading ? 'Sending...' : 'Send verification code'}
            </Button>
          </>
        )}

        {step === 'code' && (
          <>
            <p className="text-sm text-slate-500">
              We sent a 6-digit code to your phone on file.
              {devCode && (
                <span className="block mt-2 font-mono text-amber-700 bg-amber-50 p-2 rounded">
                  Dev code: {devCode}
                </span>
              )}
            </p>
            <div className="space-y-2">
              <Label htmlFor="code">Verification code</Label>
              <Input
                id="code"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="h-11 text-center text-lg tracking-widest"
              />
            </div>
            <Button
              type="button"
              className="w-full h-11"
              disabled={loading || code.length !== 6}
              onClick={() => void verifyCode()}
            >
              {loading ? 'Verifying...' : 'Continue'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full h-11"
              onClick={() => {
                setStep('phone')
                setReminderConsent(false)
                setPortalTextConsent(false)
              }}
            >
              Use a different number
            </Button>
          </>
        )}

        {step === 'dob' && (
          <>
            <p className="text-sm text-slate-500">
              For your security, enter the patient&apos;s date of birth.
            </p>
            <div className="space-y-2">
              <Label htmlFor="dob">Date of birth</Label>
              <Input
                id="dob"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="h-11"
              />
            </div>
            <Button
              type="button"
              className="w-full h-11"
              disabled={loading || !dob}
              onClick={() => void verifyDob()}
            >
              {loading ? 'Verifying...' : 'Access messages'}
            </Button>
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  )
}
