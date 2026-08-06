import prisma from '@/lib/prisma'

export type SmsProviderConfig = {
  sendNotificationOnStaffReply?: boolean
  sendOtpCodes?: boolean
}

const DEFAULTS: Required<SmsProviderConfig> = {
  sendNotificationOnStaffReply: true,
  sendOtpCodes: true,
}

export async function getSmsProviderConfig(): Promise<Required<SmsProviderConfig>> {
  const settings = await prisma.settings.findFirst({
    select: { smsProviderConfig: true },
  })

  const raw = (settings?.smsProviderConfig ?? {}) as SmsProviderConfig
  return {
    sendNotificationOnStaffReply:
      raw.sendNotificationOnStaffReply ?? DEFAULTS.sendNotificationOnStaffReply,
    sendOtpCodes: raw.sendOtpCodes ?? DEFAULTS.sendOtpCodes,
  }
}
