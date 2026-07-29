import prisma from '@/lib/prisma'

const DEFAULT_INBOXES = [
  { name: 'Scheduling', description: 'Appointment scheduling and rescheduling' },
  { name: 'Refills', description: 'Medication refill requests' },
  { name: 'Clinical', description: 'Clinical questions and urgent matters' },
  { name: 'Billing', description: 'Insurance and billing inquiries' },
] as const

/** Ensure default shared inboxes exist (idempotent). */
export async function ensureDefaultSharedInboxes() {
  for (const inbox of DEFAULT_INBOXES) {
    const existing = await prisma.sharedInbox.findFirst({
      where: { name: { equals: inbox.name, mode: 'insensitive' } },
    })
    if (!existing) {
      await prisma.sharedInbox.create({
        data: {
          name: inbox.name,
          description: inbox.description,
          isDefault: true,
        },
      })
    }
  }
}

export async function listSharedInboxesForStaff(userId: string) {
  await ensureDefaultSharedInboxes()

  const inboxes = await prisma.sharedInbox.findMany({
    orderBy: { name: 'asc' },
    include: {
      members: {
        where: { userId },
        select: { id: true },
      },
      _count: { select: { conversations: true, members: true } },
    },
  })

  return inboxes.map((inbox) => ({
    id: inbox.id,
    name: inbox.name,
    description: inbox.description,
    isDefault: inbox.isDefault,
    isSubscribed: inbox.members.length > 0,
    memberCount: inbox._count.members,
    conversationCount: inbox._count.conversations,
  }))
}
