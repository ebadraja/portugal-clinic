import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  default: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    notification: { create: vi.fn(), createMany: vi.fn() },
  },
}))

import prisma from '@/lib/prisma'
import { notifyStaffNewMessage, notifyStaffMessageAssigned } from '@/lib/messaging/notifications'

describe('lib/messaging/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('notifies assigned staff for new patient message', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.notification.createMany).mockResolvedValue({ count: 1 })

    await notifyStaffNewMessage({
      conversationId: 'conv-1',
      patientFirstName: 'Emma',
      patientLastName: 'Doe',
      preview: 'Hello',
      assignedToId: 'user-1',
    })

    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'user-1',
          type: 'new_message',
          actionUrl: '/messaging/conv-1',
        }),
      ],
    })
  })

  it('notifies assignee on conversation assignment', async () => {
    vi.mocked(prisma.notification.create).mockResolvedValue({ id: 'n-1' } as never)

    await notifyStaffMessageAssigned({
      conversationId: 'conv-2',
      patientFirstName: 'Emma',
      patientLastName: 'Doe',
      assignedToId: 'user-2',
      assignedByName: 'Admin User',
    })

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-2',
        type: 'message_assigned',
        actionUrl: '/messaging/conv-2',
      }),
    })
  })
})
