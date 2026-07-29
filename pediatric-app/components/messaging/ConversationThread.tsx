'use client'

import { useEffect, useRef } from 'react'
import {
  Archive,
  CheckCircle2,
  Loader2,
  RotateCcw,
  UserPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { MessageBubble } from '@/components/messaging/MessageBubble'
import { InternalNote } from '@/components/messaging/InternalNote'
import { MessageComposer } from '@/components/messaging/MessageComposer'
import type { ConversationSummary, SerializedMessage } from '@/types/messaging'

interface ConversationThreadProps {
  conversation: ConversationSummary | null
  messages: SerializedMessage[]
  loading: boolean
  sending: boolean
  onSend: (content: string) => Promise<void>
  onSendNote: (content: string) => Promise<void>
  onAssign: () => void
  onStatusChange: (status: 'OPEN' | 'RESOLVED' | 'ARCHIVED') => Promise<void>
  onFormLinkSent?: () => void
  onAttachmentSent?: () => void
}

export function ConversationThread({
  conversation,
  messages,
  loading,
  sending,
  onSend,
  onSendNote,
  onAssign,
  onStatusChange,
  onFormLinkSent,
  onAttachmentSent,
}: ConversationThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, conversation?.id])

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400 p-8 text-center">
        Select a conversation to view the message thread.
      </div>
    )
  }

  const patientName = `${conversation.patient.firstName} ${conversation.patient.lastName}`

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 px-4 py-3 bg-white dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900 dark:text-slate-50 truncate">{patientName}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {conversation.patient.phone ?? 'No phone'}
              {conversation.assignedTo &&
                ` · Assigned to ${conversation.assignedTo.firstName} ${conversation.assignedTo.lastName}`}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
            <Badge variant="secondary" className="text-[10px]">
              {conversation.status.replace('_', ' ')}
            </Badge>
            <Button type="button" variant="outline" size="sm" onClick={onAssign}>
              <UserPlus className="h-3.5 w-3.5 mr-1" />
              Assign
            </Button>
            {conversation.status !== 'RESOLVED' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onStatusChange('RESOLVED')}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Resolve
              </Button>
            )}
            {conversation.status !== 'ARCHIVED' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onStatusChange('ARCHIVED')}
              >
                <Archive className="h-3.5 w-3.5 mr-1" />
                Archive
              </Button>
            )}
            {(conversation.status === 'RESOLVED' || conversation.status === 'ARCHIVED') && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onStatusChange('OPEN')}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Reopen
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 bg-slate-50 dark:bg-slate-950/50 min-h-0">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-2/3 rounded-2xl" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
            No messages yet. Send a reply to start the conversation.
          </p>
        ) : (
          messages.map((msg) =>
            msg.isInternalNote ? (
              <InternalNote key={msg.id} message={msg} />
            ) : (
              <MessageBubble key={msg.id} message={msg} />
            ),
          )
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0">
        {sending && (
          <div className="px-4 py-1 text-xs text-slate-500 flex items-center gap-1 border-t border-slate-100 dark:border-slate-800">
            <Loader2 className="h-3 w-3 animate-spin" />
            Sending...
          </div>
        )}
        <MessageComposer
          disabled={conversation.status === 'ARCHIVED'}
          sending={sending}
          patientId={conversation.patientId}
          conversationId={conversation.id}
          onSend={onSend}
          onSendNote={onSendNote}
          onFormLinkSent={onFormLinkSent}
          onAttachmentSent={onAttachmentSent}
        />
      </div>
    </div>
  )
}
