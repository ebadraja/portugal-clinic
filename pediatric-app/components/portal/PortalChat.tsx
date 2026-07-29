'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Loader2, Paperclip, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FormLinkCard } from '@/components/messaging/FormLinkCard'
import { AttachmentCard } from '@/components/messaging/AttachmentCard'
import { FileAttachmentPreview } from '@/components/messaging/FileAttachmentPreview'
import { PORTAL_REASONS, REASON_LABELS } from '@/lib/messaging/portalSchemas'
import { resolveFormLinkDisplay } from '@/lib/messaging/practiceForms'
import { parseFileAttachmentMetadata, clientMimeTypesForConfig, validateClientFile } from '@/lib/messaging/fileAttachments'
import {
  DEFAULT_FILE_SHARING_CONFIG,
  type FileSharingConfig,
} from '@/lib/messaging/fileSharingConfig'
import { useMessagingPoll } from '@/lib/messaging/realtime'

interface PortalMessage {
  id: string
  senderType: string
  channel: string
  content: string
  contentType?: string
  metadata?: unknown
  createdAt: string
}

export function PortalChat() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [messages, setMessages] = useState<PortalMessage[]>([])
  const [content, setContent] = useState('')
  const [reason, setReason] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#2563eb')
  const [fileConfig, setFileConfig] = useState<FileSharingConfig>(DEFAULT_FILE_SHARING_CONFIG)
  const [attachment, setAttachment] = useState<File | null>(null)
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadMessages = useCallback(async () => {
    const res = await fetch('/api/portal/messages')
    if (res.status === 401) {
      router.replace('/portal')
      return
    }
    if (!res.ok) throw new Error('Failed to load messages')
    const data = await res.json()
    setMessages(data.messages ?? [])
    setConversationId(data.conversationId ?? null)
    if (data.reason) setReason(data.reason)
  }, [router])

  useEffect(() => {
    void (async () => {
      try {
        const [sessionRes, settingsRes] = await Promise.all([
          fetch('/api/portal/session'),
          fetch('/api/portal/settings'),
        ])
        if (!sessionRes.ok) {
          router.replace('/portal')
          return
        }
        if (settingsRes.ok) {
          const settings = await settingsRes.json()
          if (settings.primaryColor) setPrimaryColor(settings.primaryColor)
          if (settings.fileSharing) setFileConfig(settings.fileSharing)
        }
        await loadMessages()
      } catch {
        setError('Could not load messages')
      } finally {
        setLoading(false)
      }
    })()
  }, [loadMessages, router])

  useEffect(() => {
    if (!attachment) {
      setAttachmentPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(attachment)
    setAttachmentPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [attachment])

  useMessagingPoll(() => {
    if (!loading) void loadMessages()
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const clearAttachment = () => {
    setAttachment(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const validationError = validateClientFile(file, fileConfig)
    if (validationError) {
      setError(validationError)
      e.target.value = ''
      return
    }
    setAttachment(file)
    setError('')
  }

  const uploadAttachment = async () => {
    if (!attachment || uploading) return false
    if (!conversationId && !reason) {
      setError('Please select a reason for your message')
      return false
    }

    setUploading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', attachment)
      if (!conversationId && reason) formData.append('reason', reason)

      const res = await fetch('/api/portal/files', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to upload file')

      setMessages((prev) => [
        ...prev,
        {
          id: data.id,
          senderType: data.senderType,
          channel: data.channel,
          content: data.content,
          contentType: data.contentType,
          metadata: data.metadata,
          createdAt: data.createdAt,
        },
      ])
      setConversationId(data.conversationId)
      clearAttachment()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload file. Please try again.')
      return false
    } finally {
      setUploading(false)
    }
  }

  const sendMessage = async () => {
    const trimmed = content.trim()
    const hasAttachment = !!attachment
    if ((!trimmed && !hasAttachment) || sending || uploading) return
    if (!conversationId && !reason) {
      setError('Please select a reason for your message')
      return
    }

    setSending(true)
    setError('')
    try {
      if (trimmed) {
        const res = await fetch('/api/portal/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: trimmed,
            ...(!conversationId && reason ? { reason } : {}),
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to send')
        setMessages((prev) => [...prev, data])
        setConversationId(data.conversationId)
        setContent('')
      }
      if (hasAttachment) {
        await uploadAttachment()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500">
        Loading messages...
      </div>
    )
  }

  const needsReason = !conversationId
  const busy = sending || uploading
  const canSend = !!content.trim() || !!attachment

  return (
    <div className="flex flex-col flex-1 min-h-0 max-w-lg mx-auto w-full">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <p className="text-center text-sm text-slate-500 py-8">
            No messages yet. Send a message to your care team below.
          </p>
        )}
        {messages.map((msg) => {
          const isPatient = msg.senderType === 'PATIENT'
          const formLink = resolveFormLinkDisplay({
            content: msg.content,
            contentType: msg.contentType,
            metadata: msg.metadata,
          })

          if (formLink) {
            return (
              <div key={msg.id} className="flex justify-start">
                <div className="max-w-[85%] w-full">
                  <FormLinkCard
                    formName={formLink.formName}
                    formDescription={formLink.formDescription}
                    formUrl={formLink.formUrl}
                    primaryColor={primaryColor}
                    timestamp={msg.createdAt}
                  />
                </div>
              </div>
            )
          }

          const fileAttachment = parseFileAttachmentMetadata(msg.metadata)
          if (
            fileAttachment &&
            (msg.contentType === 'FILE' || msg.contentType === 'IMAGE')
          ) {
            return (
              <div key={msg.id} className={`flex ${isPatient ? 'justify-end' : 'justify-start'}`}>
                <AttachmentCard
                  messageId={msg.id}
                  fileName={fileAttachment.originalName}
                  mimeType={fileAttachment.mimeType}
                  sizeBytes={fileAttachment.sizeBytes}
                  contentType={msg.contentType as 'FILE' | 'IMAGE'}
                  timestamp={msg.createdAt}
                  primaryColor={primaryColor}
                />
              </div>
            )
          }

          return (
            <div key={msg.id} className={`flex ${isPatient ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                  isPatient
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-bl-md'
                }`}
              >
                <p
                  className={`whitespace-pre-wrap break-words ${
                    isPatient ? 'text-white' : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {msg.content}
                </p>
                <p
                  className={`text-[10px] mt-1 ${
                    isPatient ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {format(new Date(msg.createdAt), 'h:mm a')}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        {needsReason && (
          <div className="space-y-2">
            <Label htmlFor="reason">What is this about?</Label>
            <Select value={reason} onValueChange={(v) => setReason(v ?? '')}>
              <SelectTrigger id="reason" className="h-11">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {PORTAL_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {REASON_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {attachment && (
          <FileAttachmentPreview
            file={attachment}
            previewUrl={attachmentPreviewUrl}
            onRemove={clearAttachment}
            uploading={uploading}
          />
        )}

        {uploading && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Uploading file…
          </div>
        )}

        <div className="flex gap-2 items-end">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={clientMimeTypesForConfig(fileConfig)}
            onChange={handleFileSelect}
          />
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type your message..."
            className="min-h-[44px] max-h-32 resize-none flex-1"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void sendMessage()
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            className="h-11 w-11 shrink-0"
            disabled={busy || !canSend}
            onClick={() => void sendMessage()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}
