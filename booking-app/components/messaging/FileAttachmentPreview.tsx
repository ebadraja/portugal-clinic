'use client'

import { FileText, Image as ImageIcon, X } from 'lucide-react'
import { formatFileSize } from '@/lib/messaging/fileAttachments'
import { isImageMimeType } from '@/lib/messaging/fileSharingConfig'

interface FileAttachmentPreviewProps {
  file: File
  previewUrl?: string | null
  onRemove: () => void
  uploading?: boolean
}

export function FileAttachmentPreview({
  file,
  previewUrl,
  onRemove,
  uploading,
}: FileAttachmentPreviewProps) {
  const isImage = isImageMimeType(file.type)

  return (
    <div className="mb-2 flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
      {isImage && previewUrl ? (
        <img
          src={previewUrl}
          alt={file.name}
          className="h-[60px] max-w-[80px] rounded object-cover border border-slate-200 dark:border-slate-700"
        />
      ) : (
        <div className="h-10 w-10 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500">
          {isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{file.name}</p>
        <p className="text-xs text-slate-500">{formatFileSize(file.size)}{uploading ? ' · Uploading…' : ''}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={uploading}
        className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
        aria-label="Remove attachment"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
