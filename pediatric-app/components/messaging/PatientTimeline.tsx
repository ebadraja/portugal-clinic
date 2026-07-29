'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  Calendar,
  FileText,
  Mail,
  MessageSquare,
  Phone,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type TimelineEntryType = 'message' | 'appointment' | 'call_log' | 'email' | 'intake_form'

type TimelineEntry = {
  id: string
  type: TimelineEntryType
  title: string
  summary: string
  occurredAt: string
  metadata?: Record<string, unknown>
}

const TYPE_META: Record<
  TimelineEntryType,
  { icon: typeof MessageSquare; className: string }
> = {
  message: {
    icon: MessageSquare,
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  },
  appointment: {
    icon: Calendar,
    className: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  },
  call_log: {
    icon: Phone,
    className: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  },
  email: {
    icon: Mail,
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  },
  intake_form: {
    icon: FileText,
    className: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  },
}

interface PatientTimelineProps {
  patientId: string | null
}

export function PatientTimeline({ patientId }: PatientTimelineProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(false)

  const fetchTimeline = useCallback(async () => {
    if (!patientId) {
      setEntries([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/messaging/timeline/${patientId}?limit=40`)
      if (!res.ok) throw new Error('Failed')
      const json = await res.json()
      setEntries(json.data ?? [])
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    void fetchTimeline()
  }, [fetchTimeline])

  if (!patientId) {
    return <p className="text-xs text-slate-500">Select a conversation to view timeline.</p>
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    )
  }

  if (entries.length === 0) {
    return <p className="text-xs text-slate-500">No timeline events yet for this patient.</p>
  }

  return (
    <ul className="space-y-2">
      {entries.map((entry) => {
        const meta = TYPE_META[entry.type]
        const Icon = meta.icon
        const viewLink =
          entry.type === 'intake_form' && typeof entry.metadata?.viewLink === 'string'
            ? entry.metadata.viewLink
            : null

        return (
          <li
            key={`${entry.type}-${entry.id}`}
            className="rounded-md border border-slate-200 dark:border-slate-700 p-2.5 text-xs"
          >
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                  meta.className,
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-slate-900 dark:text-slate-50">{entry.title}</p>
                  <time className="shrink-0 text-[10px] text-slate-400">
                    {format(new Date(entry.occurredAt), 'MMM d, h:mm a')}
                  </time>
                </div>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{entry.summary}</p>
                {viewLink && (
                  <a
                    href={viewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block"
                  >
                    View form
                  </a>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
