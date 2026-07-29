'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (!result?.ok || result?.error) {
      setError('Invalid email or password. Please try again.');
      setIsLoading(false);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* LEFT SIDE - Features */}
      <div className="hidden lg:flex lg:w-3/5 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl"></div>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
              <Stethoscope className="w-6 h-6 text-white" />
            </div>
            <span className="text-white font-bold text-sm">Kids 0-18 Pediatrics</span>
          </div>

          <h1 className="text-5xl font-bold text-white mb-3 leading-tight">
            Kids 0-18 Integrated Pediatrics
          </h1>
          <p className="text-xl text-blue-200 mb-12">
            HIPAA-Compliant Patient Management System
          </p>

          <div className="space-y-4 mb-12">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-green-400" />
              <span className="text-slate-100">Secure & Encrypted</span>
            </div>
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-green-400" />
              <span className="text-slate-100">AI-Powered Voice & Chat</span>
            </div>
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-green-400" />
              <span className="text-slate-100">Complete Patient Insights</span>
            </div>
          </div>

          <div className="border-l-4 border-blue-400 pl-4">
            <p className="text-slate-200 italic">
              "This system has transformed how we manage patient care. The AI voice agent reduced our administrative burden by 40% while improving patient satisfaction."
            </p>
            <p className="text-slate-400 text-sm mt-2">— Dr. Jonathan Tamas, Practice Director</p>
          </div>
        </div>

        <div className="relative z-10 text-slate-400 text-xs">
          © 2026 Kids 0-18 Pediatrics. All rights reserved.
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
            <span className="font-bold text-slate-900 text-sm">Kids 0-18 Pediatrics</span>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-900">Welcome Back</h2>
            <p className="text-slate-600 text-sm mt-2">Sign in to access your dashboard</p>
          </div>

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
                  onChange={(e) => setEmail(e.target.value)}
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
                  onChange={(e) => setPassword(e.target.value)}
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

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                />
                <Label htmlFor="remember" className="text-slate-600 text-sm font-normal cursor-pointer">
                  Remember me
                </Label>
              </div>
              <a href="#" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                Forgot password?
              </a>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium mt-6"
            >
              {isLoading ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-slate-200"></div>
            <span className="text-xs text-slate-500 font-medium">OR</span>
            <div className="flex-1 h-px bg-slate-200"></div>
          </div>

          <Button
            variant="outline"
            className="w-full h-10 border-slate-300 text-slate-700 hover:bg-slate-50 font-medium gap-2"
          >
            <Shield className="w-4 h-4" />
            Sign in with SSO
          </Button>

          <div className="mt-8 pt-6 border-t border-slate-200 text-center text-sm text-slate-600">
            <p className="mb-3">
              Don&apos;t have an account?{' '}
              <span className="text-slate-700 font-medium">Contact your administrator</span>
            </p>
            <a href="#" className="text-blue-600 hover:text-blue-700 font-medium">
              Need help signing in?
            </a>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200 text-center text-xs text-slate-500">
            Protected by industry-standard encryption. This system is HIPAA-compliant.
          </div>
        </div>
      </div>
    </div>
  );
}
