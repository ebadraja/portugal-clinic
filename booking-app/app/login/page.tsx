'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ForgotPasswordForm, SetPasswordForm } from '@/components/auth/password-forms';
import {
  Stethoscope,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Shield,
  Sparkles,
  BarChart3,
  AlertCircle,
} from 'lucide-react';

function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // Sign in, "forgot password", or set a password from an invite/reset link (/login?token=…)
  const [view, setView] = useState<'signin' | 'forgot'>('signin');
  const [tokenDismissed, setTokenDismissed] = useState(false);
  const token = tokenDismissed ? null : searchParams.get('token');
  const mode: 'signin' | 'forgot' | 'token' = token ? 'token' : view;

  const backToSignIn = () => {
    setView('signin');
    setTokenDismissed(true);
    router.replace('/login');
  };

  // Two-factor: step 1 checks the password and asks whether a code is needed.
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState('');
  const timedOut = searchParams.get('timeout') === '1';

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!needCode) {
      const check = await fetch('/api/auth/login-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }).then((r) => r.json()).catch(() => ({ ok: false }));
      if (!check.ok) {
        setError(check.error ?? 'Invalid email or password. Please try again.');
        setIsLoading(false);
        return;
      }
      if (check.twoFactor) {
        setNeedCode(true);
        setIsLoading(false);
        return;
      }
    }

    const result = await signIn('credentials', {
      email,
      password,
      ...(needCode && { code }),
      redirect: false,
    });

    if (!result?.ok || result?.error) {
      setError(needCode ? 'That code is not valid. Use the newest code from your app.' : 'Invalid email or password. Please try again.');
      setIsLoading(false);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* LEFT SIDE - Features */}
      <div className="hidden lg:flex lg:w-3/5 bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-15">
          <div className="absolute top-0 left-0 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#c9a227] rounded-full mix-blend-multiply filter blur-3xl"></div>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <Stethoscope className="w-6 h-6 text-white" />
            </div>
            <span className="text-white font-bold text-sm">Nunes Monteiro</span>
          </div>

          <h1 className="text-5xl font-bold text-white mb-3 leading-tight">
            Clínica Dentária Nunes Monteiro
          </h1>
          <p className="text-xl text-blue-100 mb-12">
            Booking and patient management
          </p>

          <div className="space-y-4 mb-12">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-[#c9a227]" />
              <span className="text-blue-50">Secure & Encrypted</span>
            </div>
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-[#c9a227]" />
              <span className="text-blue-50">AI-Powered Voice & Chat</span>
            </div>
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-[#c9a227]" />
              <span className="text-blue-50">Complete Patient Insights</span>
            </div>
          </div>

          <div className="border-l-4 border-[#c9a227] pl-4">
            <p className="text-blue-50 italic">
              "A clear calendar, reliable reminders, and one place for every patient record."
            </p>
            <p className="text-blue-200/70 text-sm mt-2">— Clínica Dentária Nunes Monteiro</p>
          </div>
        </div>

        <div className="relative z-10 text-blue-200/60 text-xs">
          © 2026 Clínica Dentária Nunes Monteiro. All rights reserved.
        </div>
      </div>

      {/* RIGHT SIDE - Login Form */}
      <div className="w-full lg:w-2/5 flex flex-col justify-center items-center p-6 sm:p-8 lg:p-12">
        <div className="w-full max-w-md animate-in fade-in-up duration-500">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-slate-900 text-sm">Nunes Monteiro</span>
          </div>

          {mode === 'forgot' && <ForgotPasswordForm onBack={backToSignIn} />}
          {mode === 'token' && token && <SetPasswordForm token={token} onDone={backToSignIn} />}

          {mode === 'signin' && (
          <>
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-900">Welcome Back</h2>
            <p className="text-slate-600 text-sm mt-2">Sign in to access your dashboard</p>
          </div>

          {timedOut && !error && (
            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              You were signed out after a period of inactivity.
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="mb-5 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-700 text-sm font-medium">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setNeedCode(false); }}
                  className="pl-10 h-10 bg-slate-50 border-slate-300 focus:bg-white focus:border-blue-500 focus:ring-blue-500"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700 text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setNeedCode(false); }}
                  className="pl-10 pr-10 h-10 bg-slate-50 border-slate-300 focus:bg-white focus:border-blue-500 focus:ring-blue-500"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {needCode && (
              <div className="space-y-2">
                <Label htmlFor="code" className="text-slate-700 text-sm font-medium">
                  Two-factor code
                </Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="h-10 bg-slate-50 border-slate-300 tracking-widest"
                  required
                  disabled={isLoading}
                />
                <p className="text-xs text-slate-500">Open your authenticator app and type the 6-digit code.</p>
              </div>
            )}

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={() => { setError(''); setView('forgot'); }}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Forgot password?
              </button>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium mt-6"
            >
              {isLoading ? 'Signing in…' : needCode ? 'Verify and sign in' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-200 text-center text-sm text-slate-600">
            <p>
              Don&apos;t have an account?{' '}
              <span className="text-slate-700 font-medium">Ask a clinic administrator for an invite.</span>
            </p>
          </div>
          </>
          )}

          <div className="mt-8 pt-6 border-t border-slate-200 text-center text-xs text-slate-500">
            Restricted to clinic staff. Access to patient records is logged. Personal data is processed under the GDPR.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <LoginPage />
    </Suspense>
  );
}
