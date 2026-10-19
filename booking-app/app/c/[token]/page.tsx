import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getClinicSettings } from "@/lib/clinic/settings"
import { findByToken, linkState } from "@/lib/appointments/patientLink"
import { appointmentLink } from "@/lib/appointments/notifications"
import { googleCalendarLink } from "@/lib/appointments/messages"
import { PatientLinkActions } from "@/components/agenda/PatientLinkActions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "A sua consulta",
  robots: { index: false, follow: false },
}

type Props = { params: Promise<{ token: string }> }

function hoursUntil(start: Date, now = new Date()): number {
  return Math.max(0, (start.getTime() - now.getTime()) / 3_600_000)
}

export default async function PatientAppointmentPage({ params }: Props) {
  const { token } = await params
  const appt = await findByToken(token)
  if (!appt) notFound()
  const settings = await getClinicSettings()
  const p = settings.practice
  const state = linkState(appt)
  const tz = settings.timezone
  const day = new Intl.DateTimeFormat("pt-PT", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(appt.startTime)
  const time = new Intl.DateTimeFormat("pt-PT", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(appt.startTime)
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${p.address}`)}`
  const calendarCtx = { startTime: appt.startTime, endTime: appt.endTime, providerName: appt.provider, link: appointmentLink(appt.id), settings }

  return (
    <div lang="pt-PT" className="flex-1 bg-slate-50 dark:bg-slate-950 px-4 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-md">
        <p className="text-sm font-medium text-blue-700 dark:text-blue-300">{p.name}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          {state === "cancelled" ? "Consulta desmarcada" : state === "past" ? "Esta consulta já passou" : "A sua consulta"}
        </h1>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">Olá {appt.patient.firstName},</p>
          <div className={`mt-3 ${state === "cancelled" ? "line-through text-slate-400" : ""}`}>
            <p className="text-lg font-semibold capitalize text-slate-900 dark:text-slate-50">{day}</p>
            <p className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-50">{time}</p>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            {appt.provider && (
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 text-slate-500 dark:text-slate-400">Médico(a)</dt>
                <dd className="text-slate-800 dark:text-slate-200">{appt.provider}</dd>
              </div>
            )}
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-slate-500 dark:text-slate-400">Morada</dt>
              <dd className="text-slate-800 dark:text-slate-200">
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-slate-300 underline-offset-2 hover:text-blue-700">
                  {p.address}
                </a>
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-slate-500 dark:text-slate-400">Telefone</dt>
              <dd>
                <a href={`tel:${p.phone.replace(/\s+/g, "")}`} className="text-blue-700 underline-offset-2 hover:underline dark:text-blue-300">{p.phone}</a>
              </dd>
            </div>
          </dl>

          {(state === "active" || state === "confirmed") && (
            <PatientLinkActions
              token={token}
              initialState={state}
              cancellationNoticeHours={settings.bookingPolicy.cancellationNoticeHours}
              hoursUntil={hoursUntil(appt.startTime)}
            />
          )}
        </div>

        {(state === "active" || state === "confirmed") && (
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <a href={googleCalendarLink(calendarCtx)} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
              Adicionar ao Google Calendar
            </a>
            <a href={`/c/${token}/ics`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
              Outro calendário (.ics)
            </a>
          </div>
        )}

        <p className="mt-8 text-xs text-slate-400">
          Pedimos aviso de pelo menos {settings.bookingPolicy.cancellationNoticeHours} horas para desmarcar. Tolerância de atraso: {settings.bookingPolicy.lateToleranceMinutes} minutos.
        </p>
      </div>
    </div>
  )
}
