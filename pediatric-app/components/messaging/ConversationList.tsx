'use client'

import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { ConversationSummary } from '@/types/messaging'

function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase()
}

function statusColor(status: string) {
  if (status === 'OPEN') return 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
  if (status === 'AWAITING_REPLY') return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
  if (status === 'RESOLVED') return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  return 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
}

interface ConversationListProps {
  conversations: ConversationSummary[]
  selectedId: string | null
  loading: boolean
  onSelect: (id: string) => void
}

export function ConversationList({
  conversations,
  selectedId,
  loading,
  onSelect,
}: ConversationListProps) {
  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-slate-500 dark:text-slate-400">
        No conversations yet. Patient messages will appear here.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.map((conv) => {
        const isSelected = conv.id === selectedId
        const patientName = `${conv.patient.firstName} ${conv.patient.lastName}`
        const timeLabel = conv.lastMessageAt
          ? formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: true })
          : formatDistanceToNow(new Date(conv.createdAt), { addSuffix: true })

        return (
          <button
            key={conv.id}
            type="button"
            onClick={() => onSelect(conv.id)}
            className={cn(
              'w-full text-left px-3 py-3 border-b border-slate-100 dark:border-slate-800 transition-colors',
              isSelected
                ? 'bg-blue-50 dark:bg-blue-950/40 border-l-4 border-l-blue-600'
                : 'hover:bg-slate-50 dark:hover:bg-slate-900/60',
            )}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                {initials(conv.patient.firstName, conv.patient.lastName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn('text-sm truncate', conv.unreadCount > 0 ? 'font-semibold' : 'font-medium')}>
                    {patientName}
                  </p>
                  <span className="text-[10px] text-slate-400 shrink-0">{timeLabel}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {conv.lastMessagePreview ?? 'No messages yet'}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0', statusColor(conv.status))}>
                    {conv.status.replace('_', ' ')}
                  </Badge>
                  {conv.unreadCount > 0 && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-blue-600">{conv.unreadCount}</Badge>
                  )}
                  {conv.reason && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {conv.reason}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
