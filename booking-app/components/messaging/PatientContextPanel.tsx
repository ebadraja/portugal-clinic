'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ExternalLink, History, Phone, User } from 'lucide-react'
import { PatientTimeline } from '@/components/messaging/PatientTimeline'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { PatientContextData } from '@/types/messaging'

function calculateAge(dob: string) {
  const today = new Date()
  const birth = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

interface PatientContextPanelProps {
  patient: PatientContextData | null
  loading: boolean
  collapsed?: boolean
  onToggle?: () => void
}

export function PatientContextPanel({ patient, loading, collapsed, onToggle }: PatientContextPanelProps) {
  const [panelTab, setPanelTab] = useState<'context' | 'timeline'>('context')

  if (collapsed) {
    return (
      <div className="hidden xl:flex w-10 border-l border-slate-200 dark:border-slate-800 items-start justify-center pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={onToggle} title="Show patient context">
          <User className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <aside className="hidden lg:flex w-[300px] shrink-0 flex-col border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 min-h-0">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Patient</h3>
          {onToggle && (
            <Button type="button" variant="ghost" size="sm" className="xl:hidden" onClick={onToggle}>
              Hide
            </Button>
          )}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setPanelTab('context')}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium',
              panelTab === 'context'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
            )}
          >
            <User className="h-3 w-3" />
            Context
          </button>
          <button
            type="button"
            onClick={() => setPanelTab('timeline')}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium',
              panelTab === 'timeline'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
            )}
          >
            <History className="h-3 w-3" />
            Timeline
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !patient ? (
          <p className="text-slate-500 dark:text-slate-400">Select a conversation to view patient details.</p>
        ) : panelTab === 'timeline' ? (
          <PatientTimeline patientId={patient.id} />
        ) : (
          <>
            <section>
              <p className="font-semibold text-slate-900 dark:text-slate-50">
                {patient.firstName} {patient.lastName}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Age {calculateAge(patient.dateOfBirth)} · {patient.status}
              </p>
              {patient.parentName && (
                <p className="text-xs text-slate-500 mt-1">Guardian: {patient.parentName}</p>
              )}
              <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                {patient.phone && (
                  <p className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3" />
                    {patient.phone}
                  </p>
                )}
                {patient.email && <p>{patient.email}</p>}
                {patient.insuranceProvider && <p>Insurance: {patient.insuranceProvider}</p>}
              </div>
              <Link
                href={`/patients/${patient.id}`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-3 w-full')}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Open patient record
              </Link>
            </section>

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Upcoming appointments
              </h4>
              {patient.appointments.filter((a) => new Date(a.startTime) >= new Date()).length === 0 ? (
                <p className="text-xs text-slate-500">No upcoming appointments</p>
              ) : (
                <ul className="space-y-2">
                  {patient.appointments
                    .filter((a) => new Date(a.startTime) >= new Date())
                    .slice(0, 3)
                    .map((apt) => (
                      <li
                        key={apt.id}
                        className="rounded-md border border-slate-200 dark:border-slate-700 p-2 text-xs"
                      >
                        <p className="font-medium">{format(new Date(apt.startTime), 'MMM d, yyyy h:mm a')}</p>
                        <p className="text-slate-500 mt-0.5">
                          {apt.type.replace(/_/g, ' ')}
                          {apt.provider ? ` · ${apt.provider}` : ''}
                        </p>
                        <Badge variant="secondary" className="mt-1 text-[10px]">
                          {apt.status}
                        </Badge>
                      </li>
                    ))}
                </ul>
              )}
            </section>

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Recent call logs
              </h4>
              {patient.callLogs.length === 0 ? (
                <p className="text-xs text-slate-500">No call logs</p>
              ) : (
                <ul className="space-y-2">
                  {patient.callLogs.slice(0, 3).map((call) => (
                    <li
                      key={call.id}
                      className="rounded-md border border-slate-200 dark:border-slate-700 p-2 text-xs"
                    >
                      <p className="font-medium">{format(new Date(call.startTime), 'MMM d, h:mm a')}</p>
                      <p className="text-slate-500 mt-0.5 line-clamp-2">
                        {call.summary ?? call.outcome ?? 'Call logged'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </aside>
  )
}
