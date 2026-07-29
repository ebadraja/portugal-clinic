'use client'

import type { ReactNode } from 'react'
import { Check, MessageSquareMore } from 'lucide-react'
import { cn } from '@/lib/utils'

const LIVE_ITEMS = [
  { label: 'Voice calls (Maya)', status: 'Live' },
  { label: 'Website chat', status: 'Live' },
  { label: 'Call transcripts & logs', status: 'Live' },
] as const

const IN_DEV_ITEMS = [
  { label: 'SMS text messaging', status: 'In development' },
  { label: 'Appointment reminders', status: 'In development' },
  { label: 'Digital intake forms', status: 'In development' },
] as const

interface MessagingLockOverlayProps {
  children: ReactNode
}

export function MessagingLockOverlay({ children }: MessagingLockOverlayProps) {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <div className="blur-[6px] pointer-events-none select-none" aria-hidden="true">
        {children}
      </div>

      <div
        className="absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/15 dark:bg-slate-950/50 backdrop-blur-[2px]"
        role="presentation"
      >
        <div
          className={cn(
            'w-full max-w-[520px] rounded-2xl border border-white/20 dark:border-slate-700/60',
            'bg-white/80 dark:bg-slate-900/75 backdrop-blur-xl shadow-2xl shadow-slate-900/10 dark:shadow-black/40',
            'px-6 py-8 sm:px-8 sm:py-9',
            'animate-in fade-in-0 slide-in-from-bottom-4 duration-500',
          )}
        >
          <div className="flex justify-center mb-5">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-400/30 to-blue-500/20 blur-xl scale-150" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 shadow-lg shadow-indigo-500/25">
                <MessageSquareMore className="h-12 w-12 text-white" strokeWidth={1.5} />
              </div>
            </div>
          </div>

          <div className="flex justify-center mb-3">
            <span className="inline-flex items-center rounded-full bg-indigo-100 dark:bg-indigo-950/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200/60 dark:ring-indigo-800/60">
              Coming soon
            </span>
          </div>

          <h2 className="text-center text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Unified Patient Messaging
          </h2>

          <p className="mt-3 text-center text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            We&apos;re building a complete communication hub — SMS conversations, automated appointment
            reminders, and intake form delivery — all in one inbox alongside your call logs and webchat.
            No more switching between platforms.
          </p>

          <div className="mt-6 rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-slate-50/80 dark:bg-slate-800/40 px-4 py-4 space-y-3">
            {LIVE_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/50">
                    <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
                  </span>
                  <span className="text-slate-700 dark:text-slate-300 truncate">{item.label}</span>
                </div>
                <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {item.status}
                </span>
              </div>
            ))}

            {IN_DEV_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                    <span className="absolute h-2.5 w-2.5 rounded-full bg-indigo-400/40 animate-[pulse_3s_ease-in-out_infinite]" />
                    <span className="relative h-2 w-2 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-[pulse_3s_ease-in-out_infinite]" />
                  </span>
                  <span className="text-slate-700 dark:text-slate-300 truncate">{item.label}</span>
                </div>
                <span className="shrink-0 text-xs font-medium text-indigo-600/80 dark:text-indigo-400/80">
                  {item.status}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-5 text-center text-xs text-slate-400 dark:text-slate-500">
            Expected availability: Next update
          </p>
        </div>
      </div>
    </div>
  )
}
