export const MESSAGING_ATTACHMENTS_BUCKET = 'messaging-attachments'

export const SIGNED_URL_EXPIRY_SECONDS = 3600

export type FileSharingConfig = {
  maxFileSizeMb: 5 | 10 | 25
  allowImages: boolean
  allowPdf: boolean
  allowWord: boolean
  allowPlainText: boolean
}

export const DEFAULT_FILE_SHARING_CONFIG: FileSharingConfig = {
  maxFileSizeMb: 10,
  allowImages: true,
  allowPdf: true,
  allowWord: true,
  allowPlainText: true,
}

export const MIME_GROUPS = {
  images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  pdf: ['application/pdf'],
  word: [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  plainText: ['text/plain'],
} as const

export const ALL_ALLOWED_MIME_TYPES = [
  ...MIME_GROUPS.images,
  ...MIME_GROUPS.pdf,
  ...MIME_GROUPS.word,
  ...MIME_GROUPS.plainText,
] as const

export type AllowedMimeType = (typeof ALL_ALLOWED_MIME_TYPES)[number]

export function parseFileSharingConfig(portalConfig: unknown): FileSharingConfig {
  if (!portalConfig || typeof portalConfig !== 'object') {
    return { ...DEFAULT_FILE_SHARING_CONFIG }
  }
  const raw = (portalConfig as { fileSharing?: Partial<FileSharingConfig> }).fileSharing
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_FILE_SHARING_CONFIG }
  }
  const maxMb = raw.maxFileSizeMb
  const maxFileSizeMb: FileSharingConfig['maxFileSizeMb'] =
    maxMb === 5 || maxMb === 25 ? maxMb : 10

  return {
    maxFileSizeMb,
    allowImages: raw.allowImages !== false,
    allowPdf: raw.allowPdf !== false,
    allowWord: raw.allowWord !== false,
    allowPlainText: raw.allowPlainText !== false,
  }
}

export function getAllowedMimeTypes(config: FileSharingConfig): string[] {
  const allowed: string[] = []
  if (config.allowImages) allowed.push(...MIME_GROUPS.images)
  if (config.allowPdf) allowed.push(...MIME_GROUPS.pdf)
  if (config.allowWord) allowed.push(...MIME_GROUPS.word)
  if (config.allowPlainText) allowed.push(...MIME_GROUPS.plainText)
  return allowed
}

export function getMaxFileSizeBytes(config: FileSharingConfig): number {
  return config.maxFileSizeMb * 1024 * 1024
}

export function isImageMimeType(mimeType: string): boolean {
  return (MIME_GROUPS.images as readonly string[]).includes(mimeType)
}

export function contentTypeForMime(mimeType: string): 'IMAGE' | 'FILE' {
  return isImageMimeType(mimeType) ? 'IMAGE' : 'FILE'
}

export function mimeTypeLabel(mimeType: string): string {
  if (isImageMimeType(mimeType)) return 'Image'
  if (mimeType === 'application/pdf') return 'PDF Document'
  if ((MIME_GROUPS.word as readonly string[]).includes(mimeType)) return 'Word Document'
  if (mimeType === 'text/plain') return 'Text File'
  return 'File'
}
