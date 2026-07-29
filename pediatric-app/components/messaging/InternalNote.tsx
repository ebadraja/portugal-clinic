'use client'

import { format } from 'date-fns'
import { Lock } from 'lucide-react'
import type { SerializedMessage } from '@/types/messaging'

interface InternalNoteProps {
  message: SerializedMessage
}

export function InternalNote({ message }: InternalNoteProps) {
  return (
    <div className="flex justify-center my-3">
      <div className="max-w-[90%] w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 text-xs font-semibold mb-1">
          <Lock className="h-3.5 w-3.5" />
          Internal Note — not visible to patient
        </div>
        {message.senderName && (
          <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 mb-1">{message.senderName}</p>
        )}
        <p className="text-sm text-amber-950 dark:text-amber-100 whitespace-pre-wrap">{message.content}</p>
        <p className="text-[10px] text-amber-700/70 dark:text-amber-400/70 mt-1.5">
          {format(new Date(message.createdAt), 'MMM d, yyyy h:mm a')}
        </p>
      </div>
    </div>
  )
}
