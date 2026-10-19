'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Lock, Mail } from 'lucide-react';

function Banner({ type, children }: { type: 'error' | 'success'; children: React.ReactNode }) {
  const cls =
    type === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return (
    <div className={`mb-5 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${cls}`}>
      {type === 'error' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{children}</span>
    </div>
  );
}

/** "Forgot password?" — always shows the same confirmation, whether or not the email exists. */
export function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    try {
      const res = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState('error');
        setMessage(data.error ?? 'Could not send the reset link. Try again.');
        return;
      }
      setState('sent');
      setMessage(data.message);
    } catch {
      setState('error');
      setMessage('Network error. Try again.');
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-900">Reset password</h2>
        <p className="mt-2 text-sm text-slate-600">We&apos;ll email you a link to choose a new password.</p>
      </div>
      {state === 'sent' && <Banner type="success">{message}</Banner>}
      {state === 'error' && <Banner type="error">{message}</Banner>}
      {state !== 'sent' && (
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="reset-email" className="text-sm font-medium text-slate-700">Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <Input id="reset-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 bg-slate-50 pl-10" disabled={state === 'sending'} />
            </div>
          </div>
          <Button type="submit" disabled={state === 'sending'} className="h-10 w-full bg-blue-600 text-white hover:bg-blue-700">
            {state === 'sending' ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
      <button type="button" onClick={onBack} className="mt-6 text-sm font-medium text-blue-600 hover:text-blue-700">
        ← Back to sign in
      </button>
    </div>
  );
}

type TokenInfo =
  | { status: 'loading' }
  | { status: 'invalid'; reason: 'invalid' | 'expired' }
  | { status: 'valid'; purpose: 'invite' | 'reset'; firstName: string; email: string };

/** Set a password from an invite or reset link (/login?token=…). */
export function SetPasswordForm({ token, onDone }: { token: string; onDone: () => void }) {
  const [info, setInfo] = useState<TokenInfo>({ status: 'loading' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/auth/password-token?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setInfo(d.valid ? { status: 'valid', purpose: d.purpose, firstName: d.firstName, email: d.email } : { status: 'invalid', reason: d.reason ?? 'invalid' });
      })
      .catch(() => !cancelled && setInfo({ status: 'invalid', reason: 'invalid' }));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/auth/password-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Could not save the password.');
        return;
      }
      setDone(data.message);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (info.status === 'loading') {
    return <p className="text-sm text-slate-500">Checking your link…</p>;
  }

  if (info.status === 'invalid') {
    return (
      <div>
        <h2 className="mb-4 text-3xl font-bold text-slate-900">Link not valid</h2>
        <Banner type="error">
          {info.reason === 'expired'
            ? 'This link has expired. Use “Forgot password?” or ask an admin for a new invite.'
            : 'This link is not valid. It may already have been used.'}
        </Banner>
        <button type="button" onClick={onDone} className="text-sm font-medium text-blue-600 hover:text-blue-700">← Back to sign in</button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-900">{info.purpose === 'invite' ? `Welcome, ${info.firstName}` : 'Choose a new password'}</h2>
        <p className="mt-2 text-sm text-slate-600">For {info.email}. At least 10 characters, mixing letters with numbers or symbols.</p>
      </div>
      {done ? (
        <>
          <Banner type="success">{done}</Banner>
          <Button onClick={onDone} className="h-10 w-full bg-blue-600 text-white hover:bg-blue-700">Go to sign in</Button>
        </>
      ) : (
        <>
          {error && <Banner type="error">{error}</Banner>}
          <form onSubmit={submit} className="space-y-5">
            {[
              { id: 'new-password', label: 'New password', value: password, set: setPassword },
              { id: 'confirm-password', label: 'Confirm password', value: confirm, set: setConfirm },
            ].map((f) => (
              <div key={f.id} className="space-y-2">
                <Label htmlFor={f.id} className="text-sm font-medium text-slate-700">{f.label}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                  <Input id={f.id} type="password" autoComplete="new-password" required minLength={10} value={f.value} onChange={(e) => f.set(e.target.value)} className="h-10 bg-slate-50 pl-10" disabled={saving} />
                </div>
              </div>
            ))}
            <Button type="submit" disabled={saving} className="h-10 w-full bg-blue-600 text-white hover:bg-blue-700">
              {saving ? 'Saving…' : 'Save password'}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
