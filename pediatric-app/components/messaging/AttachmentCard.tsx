'use client'

import { FileText, Download, Image as ImageIcon, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatFileSize } from '@/lib/messaging/fileAttachments'
import { isImageMimeType, mimeTypeLabel } from '@/lib/messaging/fileSharingConfig'

export interface AttachmentCardProps {
  messageId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  contentType: 'IMAGE' | 'FILE'
  timestamp?: string | Date
  className?: string
  primaryColor?: string
}

export function AttachmentCard({
  messageId,
  fileName,
  mimeType,
  sizeBytes,
  contentType,
  timestamp,
  className,
  primaryColor = '#2563eb',
}: AttachmentCardProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(contentType === 'IMAGE')
  const isImage = contentType === 'IMAGE' || isImageMimeType(mimeType)

  useEffect(() => {
    if (!isImage) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/messaging/files/${messageId}`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data.url) setPreviewUrl(data.url)
      } finally {
        if (!cancelled) setLoadingPreview(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [messageId, isImage])

  const handleDownload = () => {
    window.open(`/api/messaging/files/${messageId}?download=1`, '_blank', 'noopener,noreferrer')
  }

  const openImage = () => {
    if (previewUrl) window.open(previewUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 p-3.5 shadow-sm max-w-[300px]',
        className,
      )}
    >
      {isImage ? (
        <div className="space-y-2">
          {loadingPreview ? (
            <div className="flex items-center justify-center h-32 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : previewUrl ? (
            <button type="button" onClick={openImage} className="block w-full text-left">
              <img
                src={previewUrl}
                alt={fileName}
                className="max-w-full max-h-[300px] rounded-lg object-contain cursor-pointer border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </button>
          ) : (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <ImageIcon className="h-4 w-4" />
              {fileName}
            </div>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {fileName} · {formatFileSize(sizeBytes)}
          </p>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5">
            <div className="shrink-0 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 text-slate-600 dark:text-slate-300">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {fileName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {formatFileSize(sizeBytes)} · {mimeTypeLabel(mimeType)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDownload}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            <Download className="h-3.5 w-3.5" />
            Download File
          </button>
        </div>
      )}

      {timestamp ? (
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 text-right">
          {format(new Date(timestamp), 'h:mm a')}
        </p>
      ) : null}
    </div>
  )
}
