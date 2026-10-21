"use client"

/**
 * One patient. The header is who they are, how to reach them, what the dentist must know
 * (red alerts) and the three things people do most: book, call, add a note. Below it, five
 * plain tabs; "Overview" answers most visits on its own.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import {
  AlertTriangle, ArrowLeft, CalendarCheck, CalendarPlus, Check, FileText, HeartPulse, Loader2, Mail, MoreHorizontal, NotebookPen, Phone, Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { PatientGdprActions } from "@/components/patients/gdpr-actions"
import { clinicalAlerts } from "@/lib/patients/alerts"
import { EditableCard } from "./EditableCard"
import { NotesPanel } from "./NotesPanel"
import { AppointmentsList, splitAppointments } from "./AppointmentsList"
import { CommsPanel } from "./CommsPanel"
import { DetailsPanel, TagsCard, contactFields, medicalFields } from "./DetailsPanel"
import { MergeDialog } from "./MergeDialog"
import { STATUS_STYLE, ageFrom, fmtDate, fmtDateTime, phoneLabel, zappyNumber, type ClinicOptions, type PatientRecordData } from "./types"

type Tab = "overview" | "appointments" | "notes" | "comms" | "details"

/** Saved through the validated profile endpoint (E.164 phones, NIF checksum). */
const PROFILE_KEYS = new Set(["phone", "phoneNote", "phone2", "phone2Note", "nif", "invoiceName", "invoiceNotes", "referredBy", "clientSource", "birthDay", "birthMonth"])

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function PatientRecord({ patientId, initialTab }: { patientId: string; initialTab: Tab }) {
  const router = useRouter()
  const session = useSession().data
  const role = session?.user?.role
  const canEdit = role === "ADMIN" || role === "STAFF"
  const isAdmin = role === "ADMIN"
  const [mergeOpen, setMergeOpen] = useState(false)
  const [patient, setPatient] = useState<PatientRecordData | null>(null)
  const [missing, setMissing] = useState(false)
  const [options, setOptions] = useState<ClinicOptions | null>(null)
  const [recallMonths, setRecallMonths] = useState(6)
  const [intakeForms, setIntakeForms] = useState<{ id: string; hippatizFormTitle: string; status: string; submittedAt: string; hippatizViewLink?: string | null }[]>([])
  const [tab, setTab] = useState<Tab>(initialTab)
  const [moreOpen, setMoreOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const noteBox = useRef<HTMLTextAreaElement | null>(null)

  const reload = useCallback(async () => {
    const res = await fetch(`/api/patients/${patientId}`)
    if (!res.ok) {
      setMissing(true)
      return
    }
    setPatient(await res.json())
  }, [patientId])

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`/api/patients/${patientId}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error("not found")
        setPatient(await r.json())
      })
      .catch((e: Error) => e.name !== "AbortError" && setMissing(true))
    fetch("/api/settings/clinic", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        setOptions({
          types: Object.fromEntries((d.appointmentTypes ?? []).map((t: { type: string; label: string }) => [t.type, t.label])),
          providers: (d.providers ?? []).filter((p: { active: boolean }) => p.active).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
        })
        if (d.bookingPolicy?.recallMonths) setRecallMonths(d.bookingPolicy.recallMonths)
      })
      .catch(() => {})
    fetch(`/api/intake-forms?linkedPatientId=${patientId}&limit=50`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setIntakeForms(d.data ?? []))
      .catch(() => {})
    return () => ctrl.abort()
  }, [patientId])

  /** Split a card's changes between the profile endpoint and the record endpoint. */
  const saveFields = useCallback(async (changes: Record<string, string | null>): Promise<string | null> => {
    const profile: Record<string, unknown> = {}
    const core: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(changes)) {
      if (PROFILE_KEYS.has(k)) profile[k] = k === "birthDay" || k === "birthMonth" ? (v ? Number(v) : null) : v
      else core[k] = v
    }
    if (Object.keys(profile).length) {
      const res = await fetch(`/api/patients/${patientId}/profile`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(profile) })
      if (!res.ok) return (await res.json().catch(() => ({}))).error ?? "Could not save"
    }
    if (Object.keys(core).length) {
      if ("firstName" in core && !core.firstName) return "First name can't be empty"
      const res = await fetch(`/api/patients/${patientId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(core) })
      if (!res.ok) return (await res.json().catch(() => ({}))).error ?? "Could not save"
    }
    await reload()
    return null
  }, [patientId, reload])

  if (missing) {
    return (
      <div className="pt-16 text-center">
        <p className="text-slate-600 dark:text-slate-400">This patient doesn&apos;t exist (or was erased).</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/patients")}>Back to patients</Button>
      </div>
    )
  }
  if (!patient) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
  }

  const name = `${patient.firstName} ${patient.lastName}`.trim()
  const age = patient.dateOfBirth ? ageFrom(patient.dateOfBirth) : null
  const alerts = clinicalAlerts(patient)
  const { upcoming, past } = splitAppointments(patient.appointments)
  const next = upcoming[0] ?? null
  const lastSeen = patient.lastVisitAt ?? past.find((a) => a.status === "COMPLETED")?.startTime ?? null
  const recallBefore = new Date()
  recallBefore.setMonth(recallBefore.getMonth() - recallMonths)
  const recallDue = !next && !!lastSeen && new Date(lastSeen) < recallBefore
  const zappyNo = zappyNumber(patient.externalId)
  const fromBooking = !!patient.externalId?.startsWith("zappy:n:")
  const book = () => router.push(`/appointments?agenda=1&patient=${encodeURIComponent(patient.id)}`)
  const values = patient as unknown as Record<string, unknown>

  async function confirmByPhone() {
    if (!next) return
    setConfirming(true)
    await fetch(`/api/agenda/appointments/${next.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "status", status: "CONFIRMED", via: "phone" }) })
    setConfirming(false)
    void reload()
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "appointments", label: "Appointments", count: patient.appointments.length },
    { id: "notes", label: "Notes & files", count: patient.notes.length + patient.documents.length + intakeForms.length },
    { id: "comms", label: "Messages & calls", count: patient.callLogs.length + patient.chatLogs.length },
    { id: "details", label: "Details" },
  ]

  return (
    <div className="mx-auto max-w-6xl pt-4 pb-10">
      <Link href="/patients" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100">
        <ArrowLeft className="h-4 w-4" /> Patients
      </Link>

      {/* ── Header ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200" aria-hidden>
              {(patient.firstName[0] ?? "?").toUpperCase()}{(patient.lastName.split(" ").filter(Boolean).at(-1)?.[0] ?? "").toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">{name}</h1>
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-slate-500 dark:text-slate-400">
                {age !== null ? <span>{age} years · born {new Date(patient.dateOfBirth!).toLocaleDateString("en-GB", { timeZone: "UTC" })}</span>
                  : patient.birthDay && patient.birthMonth ? <span>Birthday {patient.birthDay} {MONTHS[patient.birthMonth - 1]}</span>
                  : <span>Date of birth unknown</span>}
                {patient.nif && <span>NIF {patient.nif}</span>}
                {zappyNo && <span>Zappy nº {zappyNo}</span>}
                <span>{lastSeen ? `Last seen ${fmtDate(lastSeen, { month: "short", year: "numeric" })}` : "No visits on record"}</span>
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                {patient.phone ? (
                  <a href={`tel:${patient.phone}`} className="inline-flex items-center gap-1.5 font-medium text-slate-800 hover:text-blue-700 dark:text-slate-200">
                    <Phone className="h-4 w-4 text-slate-400" />{phoneLabel(patient.phone)}{patient.phoneNote && <span className="font-normal text-slate-500">({patient.phoneNote})</span>}
                  </a>
                ) : <span className="text-slate-400">No phone</span>}
                {patient.phone2 && <a href={`tel:${patient.phone2}`} className="text-slate-600 hover:text-blue-700 dark:text-slate-300">{phoneLabel(patient.phone2)}{patient.phone2Note && <span className="text-slate-500"> ({patient.phone2Note})</span>}</a>}
                {patient.email && <a href={`mailto:${patient.email}`} className="inline-flex items-center gap-1.5 text-slate-600 hover:text-blue-700 dark:text-slate-300"><Mail className="h-4 w-4 text-slate-400" />{patient.email}</a>}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button onClick={book} className="h-10 gap-2 px-4"><CalendarPlus className="h-4 w-4" />Book appointment</Button>
            {patient.phone && (
              <a href={`tel:${patient.phone}`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                <Phone className="h-4 w-4" />Call
              </a>
            )}
            {canEdit && (
              <Button variant="outline" className="h-10 gap-2" onClick={() => { setTab("overview"); setTimeout(() => noteBox.current?.focus(), 50) }}>
                <NotebookPen className="h-4 w-4" />Add note
              </Button>
            )}
            <div className="relative">
              <Button variant="outline" className="h-10 w-10 p-0" aria-label="More" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}><MoreHorizontal className="h-5 w-5" /></Button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} aria-hidden />
                  <div role="menu" className="absolute right-0 z-40 mt-1 grid w-64 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <button role="menuitem" onClick={() => { setMoreOpen(false); setTab("details") }} className="rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800">Edit details</button>
                    {isAdmin && (
                      <button role="menuitem" onClick={() => { setMoreOpen(false); setMergeOpen(true) }} className="rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800">Merge with another record…</button>
                    )}
                    <div className="border-t border-slate-100 pt-2 dark:border-slate-800"><PatientGdprActions patientId={patient.id} fullName={name} /></div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {fromBooking && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">
            <Users className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1">
              <strong>Made from a Zappy booking.</strong> The booking had no client number and other patients have this name, so its appointments were kept here. Merge it into the right patient.
            </span>
            {isAdmin && <Button size="sm" onClick={() => setMergeOpen(true)}>Find the right patient</Button>}
          </div>
        )}

        {(alerts.length > 0 || recallDue) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {alerts.map((a) => (
              <span key={a.label} title={a.source} className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1 text-sm text-red-800 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900">
                <AlertTriangle className="h-4 w-4 shrink-0" /><strong>{a.label}</strong><span className="truncate text-red-700/80 dark:text-red-300/80">{a.source}</span>
              </span>
            ))}
            {recallDue && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-sm text-blue-800 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-900">
                <CalendarCheck className="h-4 w-4" />Due for a check-up — last seen {fmtDate(lastSeen!, { month: "long", year: "numeric" })}
              </span>
            )}
          </div>
        )}
      </section>

      {isAdmin && (
        <MergeDialog
          key={patient.id}
          open={mergeOpen}
          onClose={() => setMergeOpen(false)}
          source={{
            id: patient.id, name, phone: patient.phone, nif: patient.nif, dateOfBirth: patient.dateOfBirth, zappyNumber: zappyNo, fromBooking,
            lastVisitAt: lastSeen, appointments: patient.appointments.length, notes: patient.notes.length,
          }}
        />
      )}

      {/* ── Tabs ── */}
      <nav role="tablist" aria-label="Patient record" className="sticky top-16 z-20 mt-4 flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-sm font-medium ${tab === t.id ? "border-blue-600 text-blue-700 dark:text-blue-300" : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"}`}
          >
            {t.label}
            {!!t.count && <span className="rounded-full bg-slate-200 px-1.5 text-xs tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t.count}</span>}
          </button>
        ))}
      </nav>

      <div className="mt-4">
        {tab === "overview" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <div className="grid content-start gap-4">
              {/* Next appointment */}
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Next appointment</h3>
                {next ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">{fmtDateTime(next.startTime)}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {options?.types[next.type] ?? next.reason ?? next.type}{next.provider ? ` · ${next.provider}` : ""}
                        <span className={`ml-2 rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[next.status]?.cls ?? ""}`}>{STATUS_STYLE[next.status]?.label ?? next.status}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canEdit && next.status === "SCHEDULED" && (
                        <Button variant="outline" size="sm" onClick={confirmByPhone} disabled={confirming} className="gap-1.5">
                          {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Confirmed by phone
                        </Button>
                      )}
                      <Link href={`/appointments?agenda=1&appointment=${next.id}`} className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                        Move or cancel
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-500">{recallDue ? "Nothing booked — this patient is due for a check-up." : "Nothing booked."}</p>
                    <Button size="sm" onClick={book} className="gap-1.5"><CalendarPlus className="h-3.5 w-3.5" />Book</Button>
                  </div>
                )}
                {upcoming.length > 1 && <p className="mt-2 text-xs text-slate-500">+{upcoming.length - 1} more upcoming</p>}
              </section>

              {/* Recent visits */}
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent visits</h3>
                  {past.length > 3 && <button type="button" onClick={() => setTab("appointments")} className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-300">See all</button>}
                </div>
                {past.length === 0 ? (
                  <p className="text-sm text-slate-500">{lastSeen ? `Last visit ${fmtDate(lastSeen)} (from Zappy — visit details arrive with the appointment import).` : "No visits on record."}</p>
                ) : (
                  <ul className="grid gap-1">
                    {past.slice(0, 3).map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-slate-700 dark:text-slate-300">{fmtDate(a.startTime)} · {options?.types[a.type] ?? a.reason ?? a.type}</span>
                        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[a.status]?.cls ?? ""}`}>{STATUS_STYLE[a.status]?.label ?? a.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Notes */}
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Notes</h3>
                <NotesPanel patientId={patient.id} notes={patient.notes} canEdit={canEdit} userId={session?.user?.id ?? null} isAdmin={role === "ADMIN"} limit={4} onChanged={reload} onShowAll={() => setTab("notes")} autoFocusRef={noteBox} />
              </section>
            </div>

            <div className="grid content-start gap-4">
              <EditableCard title="Medical" icon={<HeartPulse className="h-4 w-4 text-red-500" />} tone={patient.allergies?.trim() ? "alert" : "default"} fields={medicalFields()} values={values} canEdit={canEdit} onSave={saveFields} />
              <EditableCard title="Contact" icon={<Phone className="h-4 w-4 text-slate-400" />} fields={contactFields()} values={values} canEdit={canEdit} onSave={saveFields} />
              <TagsCard patient={patient} canEdit={canEdit} onSaved={reload} />
            </div>
          </div>
        )}

        {tab === "appointments" && (
          <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between px-3 pt-1">
              <p className="text-sm text-slate-500">{lastSeen && past.length === 0 ? `Last visit in Zappy: ${fmtDate(lastSeen)}. Earlier appointments arrive with the appointment import.` : "Click an appointment to open it in the agenda."}</p>
              <Button size="sm" onClick={book} className="gap-1.5"><CalendarPlus className="h-3.5 w-3.5" />Book</Button>
            </div>
            <AppointmentsList appointments={patient.appointments} options={options} />
          </section>
        )}

        {tab === "notes" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">All notes ({patient.notes.length})</h3>
              <NotesPanel patientId={patient.id} notes={patient.notes} canEdit={canEdit} userId={session?.user?.id ?? null} isAdmin={role === "ADMIN"} onChanged={reload} />
            </section>
            <div className="grid content-start gap-4">
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100"><FileText className="h-4 w-4 text-slate-400" />Documents</h3>
                {patient.documents.length === 0 ? <p className="text-sm text-slate-400">No documents.</p> : (
                  <ul className="grid gap-1 text-sm">
                    {patient.documents.map((d) => <li key={d.id} className="flex justify-between gap-2"><span className="truncate">{d.fileName}</span><span className="text-xs text-slate-400">{fmtDate(d.createdAt)}</span></li>)}
                  </ul>
                )}
                <p className="mt-3 text-xs text-slate-400">Uploading files (X-rays, consent forms) needs file storage to be connected first.</p>
              </section>
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Intake forms</h3>
                {intakeForms.length === 0 ? <p className="text-sm text-slate-400">No intake forms linked.</p> : (
                  <ul className="grid gap-1 text-sm">
                    {intakeForms.map((f) => (
                      <li key={f.id} className="flex items-center justify-between gap-2">
                        <Link href={f.hippatizViewLink ?? `/intake-forms/${f.id}`} target={f.hippatizViewLink ? "_blank" : undefined} className="truncate text-blue-700 hover:underline dark:text-blue-300">{f.hippatizFormTitle}</Link>
                        <span className="text-xs text-slate-400">{fmtDate(f.submittedAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        )}

        {tab === "comms" && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <CommsPanel patient={patient} canEdit={canEdit} />
          </section>
        )}

        {tab === "details" && <DetailsPanel patient={patient} options={options} canEdit={canEdit} onSave={saveFields} onSaved={reload} />}
      </div>
    </div>
  )
}
