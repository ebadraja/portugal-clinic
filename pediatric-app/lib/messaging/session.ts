import { auth } from '@/auth'
import type { Role } from '@/lib/generated/prisma/client'

export type StaffSession = {
  id: string
  role: Role
  firstName: string
  lastName: string
}

export async function requireStaffSession(): Promise<StaffSession | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  return {
    id: session.user.id,
    role: session.user.role,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
  }
}
