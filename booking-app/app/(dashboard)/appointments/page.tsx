import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { getClinicSettings } from "@/lib/clinic/settings"
import { todayInZone } from "@/lib/clinic/time"
import { AgendaClient } from "@/components/agenda/AgendaClient"
import { LegacyAppointmentsPage } from "@/components/appointments/LegacyAppointmentsPage"

export const dynamic = "force-dynamic"

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/**
 * Settings → Agenda → "New agenda" switches this page to the agenda (docs/agenda).
 * Before the switch, `?agenda=1` previews it (staff training on real data);
 * after it, `?classic=1` still opens the previous page.
 */
export default async function AppointmentsRoute({ searchParams }: Props) {
  const sp = await searchParams
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined
  const settings = await getClinicSettings()
  const useAgenda = settings.flags.agendaV2 ? one("classic") !== "1" : one("agenda") === "1"
  if (!useAgenda) return <LegacyAppointmentsPage />

  const session = await auth()
  const role = session?.user?.role ?? "VIEWER"
  const userId = session?.user?.id ?? null
  const patientId = one("patient")
  const patient = patientId
    ? await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, firstName: true, lastName: true } })
    : null

  return (
    <AgendaClient
      today={todayInZone(settings.timezone)}
      canWrite={role !== "VIEWER"}
      canDoubleBook={role === "ADMIN" || role === "STAFF"}
      myProviderId={settings.providers.find((p) => p.active && p.userId && p.userId === userId)?.id ?? null}
      initialAppointmentId={one("appointment") ?? null}
      bookingFor={patient ? { id: patient.id, name: `${patient.firstName} ${patient.lastName}` } : null}
    />
  )
}
