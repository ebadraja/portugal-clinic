import prisma from '@/lib/prisma'
import { parseFileSharingConfig } from '@/lib/messaging/fileSharingConfig'

export async function loadFileSharingConfig() {
  const settings = await prisma.settings.findFirst({
    select: { portalConfig: true },
  })
  return parseFileSharingConfig(settings?.portalConfig)
}
