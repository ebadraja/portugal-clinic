/**
 * In-app notifications (bell in the CRM header) for things that happened without a staff
 * member: patient link actions, voice-agent work, delivery failures.
 */
import prisma from '@/lib/prisma'

export async function notifyStaffInApp(input: {
  audience: 'admins' | 'staff'
  type: string
  title: string
  message: string
  icon: string
  actionUrl: string
  entityType?: string
  entityId?: string
}): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      approvalStatus: 'APPROVED',
      role: input.audience === 'admins' ? 'ADMIN' : { in: ['ADMIN', 'STAFF'] },
    },
    select: { id: true },
  })
  if (users.length === 0) return
  await prisma.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      type: input.type,
      title: input.title,
      message: input.message,
      icon: input.icon,
      actionUrl: input.actionUrl,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    })),
  })
}
