import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DEFAULT_FILE_SHARING_CONFIG, SIGNED_URL_EXPIRY_SECONDS, contentTypeForMime } from '@/lib/messaging/fileSharingConfig'
import {
  sanitizeFilename,
  validateUploadFile,
} from '@/lib/messaging/fileAttachments'
import { authorizeFileAccess } from '@/lib/messaging/fileAccess'

const m = vi.hoisted(() => ({
  uploadFile: vi.fn(),
  getSignedDownloadUrl: vi.fn(),
  deleteFile: vi.fn(),
  loadFileSharingConfig: vi.fn(),
  mockPrisma: {
    conversation: { findUnique: vi.fn() },
    message: { create: vi.fn() },
    $transaction: vi.fn(),
    auditLog: { create: vi.fn() },
  },
}))

vi.mock('@/lib/messaging/fileStorage', () => ({
  uploadFile: m.uploadFile,
  getSignedDownloadUrl: m.getSignedDownloadUrl,
  deleteFile: m.deleteFile,
  fileExistsOnLocalDisk: vi.fn().mockResolvedValue(false),
}))

vi.mock('@/lib/messaging/fileSharingServer', () => ({
  loadFileSharingConfig: m.loadFileSharingConfig,
}))

vi.mock('@/lib/messaging/serialize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/messaging/serialize')>()
  return {
    ...actual,
    serializeMessage: (message: { id: string; contentType: string }) => ({
      id: message.id,
      contentType: message.contentType,
      content: 'file.pdf',
      senderType: 'STAFF',
      channel: 'SYSTEM',
      createdAt: new Date().toISOString(),
    }),
  }
})

vi.mock('@/lib/prisma', () => ({ default: m.mockPrisma, prisma: m.mockPrisma }))

import { processFileUpload } from '@/lib/messaging/fileUploadServer'

const PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
])

const PDF_BUFFER = Buffer.from('%PDF-1.4\n%test')

describe('file attachments validation', () => {
  it('accepts image uploads as IMAGE content type', () => {
    const result = validateUploadFile(PNG_BUFFER, 'image/png', 'photo.png', DEFAULT_FILE_SHARING_CONFIG)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.contentType).toBe('IMAGE')
      expect(result.mimeType).toBe('image/png')
    }
  })

  it('accepts pdf uploads as FILE content type', () => {
    const result = validateUploadFile(PDF_BUFFER, 'application/pdf', 'lab-results.pdf', DEFAULT_FILE_SHARING_CONFIG)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.contentType).toBe('FILE')
    }
  })

  it('rejects files over 10MB with 413', () => {
    const huge = Buffer.alloc(11 * 1024 * 1024)
    const result = validateUploadFile(huge, 'application/pdf', 'big.pdf', DEFAULT_FILE_SHARING_CONFIG)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(413)
      expect(result.error).toContain('10MB')
    }
  })

  it('rejects disallowed MIME types with 400', () => {
    const result = validateUploadFile(
      Buffer.from('MZ'),
      'application/x-msdownload',
      'virus.exe',
      DEFAULT_FILE_SHARING_CONFIG,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
    }
  })

  it('accepts png when browser declares application/octet-stream', () => {
    const result = validateUploadFile(
      PNG_BUFFER,
      'application/octet-stream',
      'photo.png',
      DEFAULT_FILE_SHARING_CONFIG,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.mimeType).toBe('image/png')
    }
  })

  it('accepts jpeg when browser declares image/jpg', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00])
    const result = validateUploadFile(jpeg, 'image/jpg', 'photo.jpg', DEFAULT_FILE_SHARING_CONFIG)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.mimeType).toBe('image/jpeg')
    }
  })

  it('sanitizes path traversal in filenames', () => {
    expect(sanitizeFilename('../../secret.pdf')).toBe('secret.pdf')
    expect(sanitizeFilename('')).toBe('attachment')
  })
})

describe('file access authorization', () => {
  it('allows staff access', () => {
    const result = authorizeFileAccess({
      staffUserId: 'staff-1',
      portalPatientId: null,
      conversationPatientId: 'patient-1',
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.accessorType).toBe('staff')
  })

  it('allows patient access to own conversation file', () => {
    const result = authorizeFileAccess({
      staffUserId: null,
      portalPatientId: 'patient-1',
      conversationPatientId: 'patient-1',
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.accessorType).toBe('patient')
  })

  it('blocks patient from another patient conversation', () => {
    const result = authorizeFileAccess({
      staffUserId: null,
      portalPatientId: 'patient-2',
      conversationPatientId: 'patient-1',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)
  })

  it('rejects unauthenticated download', () => {
    const result = authorizeFileAccess({
      staffUserId: null,
      portalPatientId: null,
      conversationPatientId: 'patient-1',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(401)
  })
})

describe('processFileUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.loadFileSharingConfig.mockResolvedValue(DEFAULT_FILE_SHARING_CONFIG)
    m.uploadFile.mockResolvedValue({
      storageKey: 'conv-1/msg-1/file.png',
      originalName: 'photo.png',
      mimeType: 'image/png',
      sizeBytes: PNG_BUFFER.length,
    })
    m.getSignedDownloadUrl.mockResolvedValue('https://signed.example/file')
    m.mockPrisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', patientId: 'patient-1' })
    m.mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof m.mockPrisma) => unknown) =>
      fn({
        message: {
          create: vi.fn().mockResolvedValue({
            id: 'msg-1',
            conversationId: 'conv-1',
            senderType: 'STAFF',
            senderId: 'staff-1',
            channel: 'SYSTEM',
            content: 'encrypted',
            contentType: 'IMAGE',
            deliveryStatus: 'DELIVERED',
            externalMessageId: null,
            isInternalNote: false,
            readAt: null,
            metadata: {},
            createdAt: new Date(),
            sender: { id: 'staff-1', firstName: 'Sam', lastName: 'Staff' },
          }),
        },
        conversation: { update: vi.fn() },
        auditLog: { create: vi.fn() },
      } as unknown as typeof m.mockPrisma),
    )
  })

  it('creates IMAGE message for staff image upload', async () => {
    const result = await processFileUpload({
      buffer: PNG_BUFFER,
      declaredMimeType: 'image/png',
      originalFilename: 'photo.png',
      conversationId: 'conv-1',
      senderType: 'STAFF',
      senderId: 'staff-1',
      channel: 'SYSTEM',
      uploadedBy: 'staff',
      uploaderId: 'staff-1',
      auditUserId: 'staff-1',
    })

    expect(result.ok).toBe(true)
    expect(m.uploadFile).toHaveBeenCalled()
    expect(m.mockPrisma.$transaction).toHaveBeenCalled()
  })

  it('creates FILE message for patient pdf upload', async () => {
    const result = await processFileUpload({
      buffer: PDF_BUFFER,
      declaredMimeType: 'application/pdf',
      originalFilename: 'lab-results.pdf',
      conversationId: 'conv-1',
      senderType: 'PATIENT',
      senderId: null,
      channel: 'PORTAL',
      uploadedBy: 'patient',
      uploaderId: 'patient-1',
    })

    expect(result.ok).toBe(true)
    expect(contentTypeForMime('application/pdf')).toBe('FILE')
  })
})

describe('signed URL expiry', () => {
  it('uses 1 hour expiry constant', () => {
    expect(SIGNED_URL_EXPIRY_SECONDS).toBe(3600)
  })
})
