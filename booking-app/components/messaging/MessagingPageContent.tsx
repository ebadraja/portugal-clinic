'use client'

import { MessagingInbox } from '@/components/messaging/MessagingInbox'
import { MessagingLockOverlay } from '@/components/messaging/MessagingLockOverlay'
import { MessagingPreview } from '@/components/messaging/MessagingPreview'
import { MESSAGING_ENABLED } from '@/lib/messaging/messagingEnabled'

interface MessagingPageContentProps {
  initialConversationId?: string
}

export function MessagingPageContent({ initialConversationId }: MessagingPageContentProps) {
  if (MESSAGING_ENABLED) {
    return <MessagingInbox initialConversationId={initialConversationId} />
  }

  return (
    <MessagingLockOverlay>
      <MessagingPreview />
    </MessagingLockOverlay>
  )
}
