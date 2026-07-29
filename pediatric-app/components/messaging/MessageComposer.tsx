'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, MessageSquare, Paperclip, Send, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/toast-provider'
import { TemplatePicker } from '@/components/messaging/TemplatePicker'
import { FormPicker } from '@/components/messaging/FormPicker'
import { FileAttachmentPreview } from '@/components/messaging/FileAttachmentPreview'
import {
  DEFAULT_FILE_SHARING_CONFIG,
  type FileSharingConfig,
} from '@/lib/messaging/fileSharingConfig'
import { clientMimeTypesForConfig, validateClientFile } from '@/lib/messaging/fileAttachments'

interface MessageComposerProps {
  disabled?: boolean
  sending?: boolean
  patientId?: string | null
  conversationId?: string | null
  onSend: (content: string) => Promise<void>
  onSendNote: (content: string) => Promise<void>
  onFormLinkSent?: () => void
  onAttachmentSent?: () => void
}

export function MessageComposer({
  disabled,
  sending,
  patientId,
  conversationId,
  onSend,
  onSendNote,
  onFormLinkSent,
  onAttachmentSent,
}: MessageComposerProps) {
  const { showToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [content, setContent] = useState('')
  const [mode, setMode] = useState<'reply' | 'note'>('reply')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [fileConfig, setFileConfig] = useState<FileSharingConfig>(DEFAULT_FILE_SHARING_CONFIG)

  useEffect(() => {
    void fetch('/api/messaging/file-sharing-config')
      .then((r) => (r.ok ? r.json() : DEFAULT_FILE_SHARING_CONFIG))
      .then((data) => setFileConfig(data))
      .catch(() => setFileConfig(DEFAULT_FILE_SHARING_CONFIG))
  }, [])

  useEffect(() => {
    if (!attachment) {
      setAttachmentPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(attachment)
    setAttachmentPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [attachment])

  const clearAttachment = () => {
    setAttachment(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const error = validateClientFile(file, fileConfig)
    if (error) {
      showToast(error, 'error')
      e.target.value = ''
      return
    }
    setAttachment(file)
  }

  const uploadAttachment = async () => {
    if (!attachment || !conversationId || uploading) return false

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', attachment)
      const res = await fetch(`/api/messaging/conversations/${conversationId}/files`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to upload file')
      clearAttachment()
      onAttachmentSent?.()
      return true
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Failed to upload file. Please try again.',
        'error',
      )
      return false
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async () => {
    const trimmed = content.trim()
    const hasAttachment = !!attachment
    if ((!trimmed && !hasAttachment) || sending || disabled || uploading) return

    if (mode === 'note') {
      if (!trimmed) return
      await onSendNote(trimmed)
      setContent('')
      return
    }

    try {
      if (trimmed) {
        await onSend(trimmed)
        setContent('')
      }
      if (hasAttachment) {
        await uploadAttachment()
      }
    } catch {
      showToast('Failed to send message', 'error')
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSubmit()
    }
  }

  const busy = sending || uploading
  const canSend = !!content.trim() || !!attachment

  return (
    <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      <div className="flex gap-1 mb-2">
        <button
          type="button"
          onClick={() => setMode('reply')}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium',
            mode === 'reply'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Reply
        </button>
        <button
          type="button"
          onClick={() => setMode('note')}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium',
            mode === 'note'
              ? 'bg-amber-500 text-white'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
          )}
        >
          <StickyNote className="h-3.5 w-3.5" />
          Internal Note
        </button>
      </div>

      {mode === 'reply' && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <TemplatePicker
            patientId={patientId ?? null}
            disabled={disabled || busy}
            onInsert={(text) => setContent((prev) => (prev ? `${prev}\n\n${text}` : text))}
          />
          <FormPicker
            conversationId={conversationId}
            disabled={disabled || busy}
            onFormLinkSent={onFormLinkSent}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={disabled || busy || !conversationId}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-3.5 w-3.5 mr-1" />
            Attach
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={clientMimeTypesForConfig(fileConfig)}
            onChange={handleFileSelect}
          />
        </div>
      )}

      {attachment && mode === 'reply' && (
        <FileAttachmentPreview
          file={attachment}
          previewUrl={attachmentPreviewUrl}
          onRemove={clearAttachment}
          uploading={uploading}
        />
      )}

      {uploading && (
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Uploading file…
        </div>
      )}

      <div className="flex gap-2 items-end">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled || busy}
          placeholder={
            mode === 'note'
              ? 'Add an internal note (visible to staff only)...'
              : 'Type a reply to the patient...'
          }
          className={cn(
            'min-h-[72px] resize-none flex-1',
            mode === 'note' && 'border-amber-300 dark:border-amber-700',
          )}
        />
        <Button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={disabled || busy || !canSend || (mode === 'note' && !content.trim())}
          className={cn('shrink-0', mode === 'note' && 'bg-amber-500 hover:bg-amber-600')}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
