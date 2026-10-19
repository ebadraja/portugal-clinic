"use client"

/** Upcoming and past appointments of one patient; each opens in the agenda. */
import Link from "next/link"
import { STATUS_STYLE, fmtDateTime, type ClinicOptions, type RecordAppointment } from "./types"

const SOURCE: Record<string, string> = {
  VOICE_AGENT: "Booked by Acácia",
  WEBSITE: "Booked online",
  PATIENT_LINK: "Patient link",
  IMPORT: "From Zappy",
}

export function splitAppointments(list: RecordAppointment[], now = new Date()) {
  const upcoming = list
    .filter((a) => new Date(a.startTime) > now && (a.status === "SCHEDULED" || a.status === "CONFIRMED"))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
  const past = list.filter((a) => !upcoming.includes(a)).sort((a, b) => b.startTime.localeCompare(a.startTime))
  return { upcoming, past }
}

function Row({ a, options }: { a: RecordAppointment; options: ClinicOptions | null }) {
  const st = STATUS_STYLE[a.status] ?? STATUS_STYLE.SCHEDULED
  const type = options?.types[a.type] ?? a.reason ?? a.type
  return (
    <li>
      <Link href={`/appointments?agenda=1&appointment=${a.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60">
        <span className="w-52 shrink-0 text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">{fmtDateTime(a.startTime)}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
          {type}{a.provider ? <span className="text-slate-400"> · {a.provider}</span> : null}
        </span>
        {SOURCE[a.bookedVia] && <span className="text-xs text-slate-400">{SOURCE[a.bookedVia]}</span>}
        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${st.cls}`}>{a.checkedInAt && a.status !== "COMPLETED" ? "Arrived" : st.label}</span>
      </Link>
    </li>
  )
}

export function AppointmentsList({ appointments, options, limitPast }: { appointments: RecordAppointment[]; options: ClinicOptions | null; limitPast?: number }) {
  const { upcoming, past } = splitAppointments(appointments)
  const shownPast = limitPast ? past.slice(0, limitPast) : past
  const noShows = appointments.filter((a) => a.status === "NO_SHOW").length
  return (
    <div className="grid gap-4">
      <div>
        <h4 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Upcoming</h4>
        {upcoming.length === 0 ? <p className="px-3 text-sm text-slate-400">Nothing booked.</p> : <ul>{upcoming.map((a) => <Row key={a.id} a={a} options={options} />)}</ul>}
      </div>
      <div>
        <h4 className="mb-1 flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Past {noShows > 0 && <span className="normal-case text-red-600">· {noShows} no-show{noShows === 1 ? "" : "s"}</span>}
        </h4>
        {past.length === 0 ? <p className="px-3 text-sm text-slate-400">No past appointments in the CRM yet.</p> : <ul>{shownPast.map((a) => <Row key={a.id} a={a} options={options} />)}</ul>}
        {appointments.length >= 50 && !limitPast && <p className="px-3 pt-2 text-xs text-slate-400">Showing the 50 most recent appointments.</p>}
      </div>
    </div>
  )
}
