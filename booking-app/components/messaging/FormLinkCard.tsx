'use client'

import { ClipboardList, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

export interface FormLinkCardProps {
  formName: string
  formDescription?: string | null
  formUrl: string
  primaryColor?: string
  sentByName?: string | null
  timestamp?: string | Date
  className?: string
}

export function FormLinkCard({
  formName,
  formDescription,
  formUrl,
  primaryColor = '#2563eb',
  sentByName,
  timestamp,
  className,
}: FormLinkCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 p-3.5 shadow-sm',
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="shrink-0 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 text-slate-600 dark:text-slate-300">
          <ClipboardList className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
            {formName}
          </p>
          {formDescription ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              {formDescription}
            </p>
          ) : null}
          {sentByName ? (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">
              Sent by {sentByName}
            </p>
          ) : null}
        </div>
      </div>

      <a
        href={formUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: primaryColor }}
      >
        Open Form
        <ExternalLink className="h-3.5 w-3.5" />
      </a>

      {timestamp ? (
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 text-right">
          {format(new Date(timestamp), 'h:mm a')}
        </p>
      ) : null}
    </div>
  )
}
