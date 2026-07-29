import { basename } from 'path'
import type { FileSharingConfig } from '@/lib/messaging/fileSharingConfig'
import {
  contentTypeForMime,
  getAllowedMimeTypes,
  getMaxFileSizeBytes,
  isImageMimeType,
} from '@/lib/messaging/fileSharingConfig'

export type FileAttachmentMetadata = {
  storageKey: string
  originalName: string
  mimeType: string
  sizeBytes: number
}

export function sanitizeFilename(name: string): string {
  const base = basename(name).replace(/[/\\?%*:|"<>]/g, '_').replace(/\.\./g, '_').trim()
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, '_')
  return (cleaned || 'attachment').slice(0, 200)
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function detectMimeTypeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf'
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png'
  }
  if (buffer.length >= 6 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif'
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp'
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  ) {
    return 'application/msword'
  }
  return null
}

const GENERIC_MIME_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream'])

export function normalizeMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase().trim()
  if (normalized === 'image/jpg' || normalized === 'image/pjpeg') {
    return 'image/jpeg'
  }
  return normalized
}

function isGenericDeclaredMime(mimeType: string): boolean {
  return GENERIC_MIME_TYPES.has(normalizeMimeType(mimeType))
}

function mimeFromFilename(filename: string): string | null {
  const ext = filename.toLowerCase().split('.').pop()
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'pdf':
      return 'application/pdf'
    case 'doc':
      return 'application/msword'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'txt':
      return 'text/plain'
    default:
      return null
  }
}

export type FileValidationResult =
  | { ok: true; mimeType: string; contentType: 'IMAGE' | 'FILE' }
  | { ok: false; status: 400 | 413; error: string }

export function validateUploadFile(
  buffer: Buffer,
  declaredMimeType: string,
  filename: string,
  config: FileSharingConfig,
): FileValidationResult {
  const maxBytes = getMaxFileSizeBytes(config)
  if (buffer.length > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `File is too large. Maximum size is ${config.maxFileSizeMb}MB`,
    }
  }

  if (buffer.length === 0) {
    return { ok: false, status: 400, error: 'File is empty' }
  }

  const allowed = getAllowedMimeTypes(config)
  const declared = normalizeMimeType(declaredMimeType)
  const detected = detectMimeTypeFromBuffer(buffer)
  const fromName = mimeFromFilename(filename)
  const mimeType = detected ?? (isGenericDeclaredMime(declared) ? fromName : declared)

  if (!mimeType || !allowed.includes(mimeType)) {
    return {
      ok: false,
      status: 400,
      error: 'This file type is not supported. Please upload PDF, Word, or image files.',
    }
  }

  if (detected && !isGenericDeclaredMime(declared) && detected !== declared) {
    return {
      ok: false,
      status: 400,
      error: 'This file type is not supported. Please upload PDF, Word, or image files.',
    }
  }

  const safeName = sanitizeFilename(filename)
  if (!safeName || safeName === 'attachment' && !filename) {
    return { ok: false, status: 400, error: 'Invalid file name' }
  }

  return {
    ok: true,
    mimeType,
    contentType: contentTypeForMime(mimeType),
  }
}

export function parseFileAttachmentMetadata(metadata: unknown): FileAttachmentMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null
  const meta = metadata as Partial<FileAttachmentMetadata>
  if (
    typeof meta.storageKey !== 'string' ||
    typeof meta.originalName !== 'string' ||
    typeof meta.mimeType !== 'string' ||
    typeof meta.sizeBytes !== 'number'
  ) {
    return null
  }
  return {
    storageKey: meta.storageKey,
    originalName: meta.originalName,
    mimeType: meta.mimeType,
    sizeBytes: meta.sizeBytes,
  }
}

export function attachmentPreviewText(originalName: string, mimeType: string): string {
  if (isImageMimeType(mimeType)) return 'Photo'
  return `Attachment: ${originalName}`
}

export function clientMimeTypesForConfig(config: FileSharingConfig): string {
  const parts: string[] = []
  if (config.allowImages) parts.push('image/jpeg,image/png,image/gif,image/webp')
  if (config.allowPdf) parts.push('application/pdf')
  if (config.allowWord) {
    parts.push(
      'application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.doc,.docx',
    )
  }
  if (config.allowPlainText) parts.push('text/plain')
  return parts.join(',')
}

export function validateClientFile(file: File, config: FileSharingConfig): string | null {
  const maxBytes = getMaxFileSizeBytes(config)
  if (file.size > maxBytes) {
    return `File is too large. Maximum size is ${config.maxFileSizeMb}MB`
  }
  const allowed = getAllowedMimeTypes(config)
  const declared = normalizeMimeType(file.type)
  const mimeType = isGenericDeclaredMime(declared) ? mimeFromFilename(file.name) : declared
  if (!mimeType || !allowed.includes(mimeType)) {
    return 'This file type is not supported. Please upload PDF, Word, or image files.'
  }
  return null
}
