'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface PortalMagicLinkProps {
  token: string
}

export function PortalMagicLink({ token }: PortalMagicLinkProps) {
  const router = useRouter()
  const [dob, setDob] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const verify = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/portal/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'magic_link_exchange',
          token,
          dateOfBirth: dob,
        }),
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
        <CardTitle className="text-lg">Verify to open your messages</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-500">
          Enter the patient&apos;s date of birth to continue securely.
        </p>
        <div className="space-y-2">
          <Label htmlFor="magic-dob">Date of birth</Label>
          <Input
            id="magic-dob"
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
          onClick={() => void verify()}
        >
          {loading ? 'Verifying...' : 'Continue to messages'}
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  )
}
