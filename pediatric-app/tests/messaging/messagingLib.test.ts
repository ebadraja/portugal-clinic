import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveMessagingMergeTags } from '@/lib/messaging/mergeTags'
import { resolveInboxForReason } from '@/lib/messaging/router'
import { previewText, encryptMessageContent, serializeMessage } from '@/lib/messaging/serialize'
import { decrypt } from '@/lib/crypto'

vi.mock('@/lib/prisma', () => ({
  default: {
    patient: { findUnique: vi.fn() },
    settings: { findFirst: vi.fn() },
    appointment: { findUnique: vi.fn() },
    sharedInbox: { findFirst: vi.fn() },
  },
}))

import prisma from '@/lib/prisma'

describe('lib/messaging/mergeTags', () => {
  beforeEach(() => {
    vi.mocked(prisma.patient.findUnique).mockResolvedValue({
      firstName: 'Emma',
      lastName: 'Doe',
      parentName: 'Jane Doe',
    } as never)
    vi.mocked(prisma.settings.findFirst).mockResolvedValue({
      practiceName: 'Kids 0-18',
      practicePhone: '555-0100',
      practiceWebsite: 'https://kids0to18.com',
      portalConfig: { baseUrl: 'https://portal.kids0to18.com' },
    } as never)
    vi.mocked(prisma.appointment.findUnique).mockResolvedValue(null)
  })

  it('resolves patient and practice merge tags', async () => {
    const result = await resolveMessagingMergeTags(
      'Hi {{patient.firstName}}, contact {{practice.name}} at {{practice.phone}}. Portal: {{portal.link}}',
      { patientId: 'pt-1' },
    )
    expect(result).toContain('Emma')
    expect(result).toContain('Kids 0-18')
    expect(result).toContain('555-0100')
    expect(result).toContain('https://portal.kids0to18.com/portal')
  })
})

describe('lib/messaging/router', () => {
  beforeEach(() => {
    vi.mocked(prisma.settings.findFirst).mockResolvedValue({ defaultRoutingRules: null } as never)
    vi.mocked(prisma.sharedInbox.findFirst).mockResolvedValue({ id: 'inbox-scheduling' } as never)
  })

  it('maps SCHEDULING reason to Scheduling inbox', async () => {
    const inboxId = await resolveInboxForReason('SCHEDULING')
    expect(inboxId).toBe('inbox-scheduling')
    expect(prisma.sharedInbox.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { equals: 'Scheduling', mode: 'insensitive' } },
      }),
    )
  })

  it('returns null when reason is missing', async () => {
    expect(await resolveInboxForReason(null)).toBeNull()
  })
})

describe('lib/messaging/serialize', () => {
  it('truncates preview text', () => {
    expect(previewText('short')).toBe('short')
    expect(previewText('a'.repeat(120))).toHaveLength(101)
    expect(previewText('a'.repeat(120)).endsWith('…')).toBe(true)
  })

  it('encrypts and serializes message content', () => {
    const encrypted = encryptMessageContent('Hello patient')
    expect(encrypted.startsWith('gcm:v1:')).toBe(true)

    const serialized = serializeMessage({
      id: 'msg-1',
      conversationId: 'conv-1',
      senderType: 'STAFF',
      senderId: 'user-1',
      channel: 'PORTAL',
      content: encrypted,
      contentType: 'TEXT',
      deliveryStatus: 'SENT',
      externalMessageId: null,
      isInternalNote: false,
      readAt: null,
      metadata: null,
      createdAt: new Date('2026-06-14'),
      sender: { id: 'user-1', firstName: 'Josh', lastName: 'Nurse' },
    })

    expect(serialized.content).toBe('Hello patient')
    expect(serialized.senderName).toBe('Josh Nurse')
    expect(decrypt(encrypted)).toBe('Hello patient')
  })
})
