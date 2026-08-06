'use client'

import { Check, Globe, MessageSquare, Monitor, Send, Smartphone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const FAKE_THREADS = [
  {
    id: '1',
    name: 'Sarah Mitchell',
    preview: "Hi, I'd like to reschedule Emma's appointment from Thursday to next Monday if possible.",
    time: '12m ago',
    unread: 2,
    selected: true,
  },
  {
    id: '2',
    name: 'David Chen',
    preview: 'Can you confirm the lab results were sent to our PCP?',
    time: '1h ago',
    unread: 0,
    selected: false,
  },
  {
    id: '3',
    name: 'Maria Gonzalez',
    preview: 'Thank you — the portal link worked perfectly.',
    time: '2h ago',
    unread: 0,
    selected: false,
  },
  {
    id: '4',
    name: 'James & Lisa Patel',
    preview: 'We need a refill authorization for albuterol inhaler.',
    time: '3h ago',
    unread: 1,
    selected: false,
  },
  {
    id: '5',
    name: 'Robert Kim',
    preview: 'Is the practice open this Saturday for sick visits?',
    time: 'Yesterday',
    unread: 0,
    selected: false,
  },
  {
    id: '6',
    name: 'Amanda Foster',
    preview: 'Insurance card updated — attached via web chat.',
    time: 'Yesterday',
    unread: 0,
    selected: false,
  },
]

const FAKE_MESSAGES = [
  {
    id: 'm1',
    role: 'patient' as const,
    channel: 'Portal',
    content: "Hi, I'd like to reschedule Emma's appointment from Thursday to next Monday if possible.",
    time: '10:42 AM',
  },
  {
    id: 'm2',
    role: 'staff' as const,
    channel: 'Portal',
    content: "Of course! Let me check Dr. Tamas's availability for Monday.",
    time: '10:44 AM',
  },
  {
    id: 'm3',
    role: 'staff' as const,
    channel: 'System',
    content: "Emma's insurance was verified — Premera Blue Cross, active through 12/2026.",
    time: '10:45 AM',
    system: true,
  },
  {
    id: 'm4',
    role: 'staff' as const,
    channel: 'Portal',
    content: 'Monday at 9:15 AM is open. Would that work for you?',
    time: '10:46 AM',
  },
  {
    id: 'm5',
    role: 'patient' as const,
    channel: 'Portal',
    content: 'Perfect — yes, Monday at 9:15 works. Thank you!',
    time: '10:48 AM',
  },
]

function initials(name: string) {
  const parts = name.split(/\s+/)
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
}

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === 'SMS') return <Smartphone className="h-3 w-3" />
  if (channel === 'Web Chat') return <Globe className="h-3 w-3" />
  if (channel === 'Portal') return <Monitor className="h-3 w-3" />
  return <MessageSquare className="h-3 w-3" />
}

export function MessagingPreview() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] min-h-[600px] -mx-4 md:-mx-6 lg:-mx-8">
      <div className="px-4 md:px-6 lg:px-8 pb-3">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Messaging</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Unified inbox for patient conversations across portal, web chat, and SMS.
        </p>
      </div>

      <div className="flex flex-1 min-h-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mx-4 md:mx-6 lg:mx-8 rounded-t-xl overflow-hidden shadow-sm">
        <div className="w-[280px] shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-800 min-h-0">
          <div className="flex gap-1 p-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
            {['All', 'Unassigned', 'Mine', 'Scheduling'].map((tab, i) => (
              <span
                key={tab}
                className={cn(
                  'shrink-0 rounded-md px-2.5 py-1 text-xs font-medium',
                  i === 0
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400',
                )}
              >
                {tab}
              </span>
            ))}
          </div>
          <div className="p-2 border-b border-slate-200 dark:border-slate-800">
            <Input placeholder="Search patients or messages..." className="h-9 text-sm" readOnly />
          </div>
          <div className="flex-1 overflow-hidden">
            {FAKE_THREADS.map((thread) => (
              <div
                key={thread.id}
                className={cn(
                  'px-3 py-3 border-b border-slate-100 dark:border-slate-800/80 cursor-default',
                  thread.selected && 'bg-blue-50/80 dark:bg-blue-950/30',
                )}
              >
                <div className="flex items-start gap-2.5">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {initials(thread.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-50 truncate">
                        {thread.name}
                      </p>
                      <span className="text-[10px] text-slate-400 shrink-0">{thread.time}</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                      {thread.preview}
                    </p>
                  </div>
                  {thread.unread > 0 && (
                    <Badge className="h-5 min-w-5 px-1 text-[10px] bg-blue-600 text-white shrink-0">
                      {thread.unread}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 px-4 py-3">
            <h2 className="font-semibold text-slate-900 dark:text-slate-50">Sarah Mitchell</h2>
            <p className="text-xs text-slate-500 mt-0.5">(555) 301-1001 · Assigned to Dr. Tamas</p>
          </div>

          <div className="flex-1 overflow-hidden px-4 py-4 bg-slate-50 dark:bg-slate-950/50 space-y-3">
            {FAKE_MESSAGES.map((msg) =>
              msg.system ? (
                <div key={msg.id} className="flex justify-center">
                  <div className="max-w-[85%] rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs text-slate-600 dark:text-slate-400 text-center">
                    <p>{msg.content}</p>
                    <p className="mt-1 text-[10px] opacity-70">{msg.time}</p>
                  </div>
                </div>
              ) : (
                <div
                  key={msg.id}
                  className={cn('flex', msg.role === 'staff' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[78%] rounded-2xl px-3.5 py-2.5 shadow-sm',
                      msg.role === 'staff'
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-bl-md',
                    )}
                  >
                    <p
                      className={cn(
                        'text-sm whitespace-pre-wrap',
                        msg.role === 'staff' ? 'text-white' : 'text-slate-900 dark:text-slate-100',
                      )}
                    >
                      {msg.content}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-[10px]',
                          msg.role === 'staff' ? 'text-blue-100' : 'text-slate-400',
                        )}
                      >
                        <ChannelIcon channel={msg.channel} />
                        {msg.channel}
                      </span>
                      <span
                        className={cn(
                          'text-[10px]',
                          msg.role === 'staff' ? 'text-blue-100' : 'text-slate-400',
                        )}
                      >
                        {msg.time}
                      </span>
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>

          <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900">
            <div className="flex gap-2 items-end">
              <Textarea
                readOnly
                placeholder="Type a reply to the patient..."
                className="min-h-[72px] resize-none flex-1"
              />
              <Button type="button" disabled className="shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <aside className="hidden xl:flex w-[260px] shrink-0 flex-col border-l border-slate-200 dark:border-slate-800 p-4 text-sm">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 mb-3">Patient Context</h3>
          <p className="font-semibold">Sarah Mitchell</p>
          <p className="text-xs text-slate-500 mt-1">Age 8 · ACTIVE</p>
          <p className="text-xs text-slate-500 mt-1">Guardian: Sarah Mitchell</p>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">(555) 301-1001</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">Insurance: Premera Blue Cross</p>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Upcoming appointments
            </p>
            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2 text-xs">
              <p className="font-medium">Mon, Jun 16 · 9:15 AM</p>
              <p className="text-slate-500">Well-child · Dr. Tamas</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
