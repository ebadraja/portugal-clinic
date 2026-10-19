import prisma from '@/lib/prisma'
import { buildClinicSettings } from '@/lib/clinic/settings'
import { formatDateShort, formatTime } from '@/lib/clinic/time'

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
    prisma.settings.findFirst(),
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

  const clinic = buildClinicSettings(settings)
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
    // Clinic wall time + locale (SMS: "20/10/2026", "09:30").
    'appointment.date': appointment ? formatDateShort(appointment.startTime, clinic.timezone, clinic.locale) : '',
    'appointment.time': appointment ? formatTime(appointment.startTime, clinic.timezone, clinic.locale) : '',
    'appointment.provider': appointment?.provider ?? '',
    'appointment.type': appointment ? clinic.appointmentTypes.find((t) => t.type === appointment.type)?.label ?? 'Consulta' : '',
    'practice.name': clinic.practice.name,
    'practice.phone': clinic.practice.phone,
    'portal.link': `${portalBase.replace(/\/$/, '')}/portal`,
  }

  return body.replace(/\{\{([a-zA-Z.]+)\}\}/g, (match, key: string) => {
    return key in tags ? tags[key] : match
  })
}
