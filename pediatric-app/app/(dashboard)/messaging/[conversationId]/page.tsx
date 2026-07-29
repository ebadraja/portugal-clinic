'use client'

import { use } from 'react'
import { MessagingPageContent } from '@/components/messaging/MessagingPageContent'

export default function MessagingConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = use(params)
  return <MessagingPageContent initialConversationId={conversationId} />
}
