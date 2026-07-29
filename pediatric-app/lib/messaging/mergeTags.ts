import { format } from 'date-fns'
import prisma from '@/lib/prisma'

export interface MergeTagContext {
  patientId: string
  appointmentId?: string
}

/**
 * Resolve messaging template merge tags per requirements (FR-602).
 * Supports: patient.*, appointment.*, practice.*, portal.link
 */
export async function resolveMessagingMergeTags(
  body: string,
  context: MergeTagContext,
): Promise<string> {
  const [patient, settings, appointment] = await Promise.all([
    prisma.patient.findUnique({
      where: { id: context.patientId },
      select: {
        firstName: true,
        lastName: true,
        parentName: true,
      },
    }),
    prisma.settings.findFirst({
      select: {
        practiceName: true,
        practicePhone: true,
        practiceWebsite: true,
        portalConfig: true,
      },
    }),
    context.appointmentId
      ? prisma.appointment.findUnique({
          where: { id: context.appointmentId },
          select: {
            startTime: true,
            type: true,
            provider: true,
          },
        })
      : Promise.resolve(null),
  ])

  if (!patient) return body

  const portalConfig = (settings?.portalConfig as { baseUrl?: string } | null)?.baseUrl
  let portalBase =
    portalConfig?.replace(/\/$/, '') ??
    process.env.NEXTAUTH_URL?.replace(/\/$/, '') ??
    'http://localhost:3000'
  portalBase = portalBase.replace(/\/portal$/, '')

  const tags: Record<string, string> = {
    'patient.firstName': patient.firstName,
    'patient.lastName': patient.lastName,
    'patient.parentName': patient.parentName ?? '',
    'appointment.date': appointment ? format(appointment.startTime, 'MMMM d, yyyy') : '',
    'appointment.time': appointment ? format(appointment.startTime, 'h:mm a') : '',
    'appointment.provider': appointment?.provider ?? '',
    'appointment.type': appointment?.type ?? '',
    'practice.name': settings?.practiceName ?? 'Kids 0-18 Integrated Pediatrics',
    'practice.phone': settings?.practicePhone ?? '',
    'portal.link': `${portalBase.replace(/\/$/, '')}/portal`,
  }

  return body.replace(/\{\{([a-zA-Z.]+)\}\}/g, (match, key: string) => {
    return key in tags ? tags[key] : match
  })
}
