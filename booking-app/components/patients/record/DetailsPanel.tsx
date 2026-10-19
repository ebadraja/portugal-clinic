"use client"

/** "Details" tab: everything about the person, grouped the way a dental practice thinks. */
import { useState } from "react"
import { Briefcase, Contact, HeartPulse, Home, IdCard, Loader2, Plus, ShieldCheck, Tag, UserRound, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EditableCard, type FieldSpec } from "./EditableCard"
import { ageFrom, phoneLabel, zappyNumber, type ClinicOptions, type PatientRecordData } from "./types"

export type SaveFields = (changes: Record<string, string | null>) => Promise<string | null>

const GENDER = [
  { value: "FEMALE", label: "Female" },
  { value: "MALE", label: "Male" },
  { value: "OTHER", label: "Other" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const STATUS = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "ARCHIVED", label: "Archived (hidden from lists)" },
]

const tel = (v: unknown) => (typeof v === "string" && v ? <a href={`tel:${v}`} className="text-blue-700 hover:underline dark:text-blue-300">{phoneLabel(v)}</a> : null)

export function contactFields(): FieldSpec[] {
  return [
    { key: "phone", label: "Mobile", type: "tel", placeholder: "912 345 678", display: tel },
    { key: "phoneNote", label: "Mobile note", placeholder: "e.g. only after 18h" },
    { key: "phone2", label: "Other phone", type: "tel", display: tel },
    { key: "phone2Note", label: "Other phone note", placeholder: "e.g. home" },
    { key: "email", label: "Email", type: "email", wide: true },
  ]
}

export function medicalFields(): FieldSpec[] {
  return [
    { key: "allergies", label: "Allergies", type: "textarea", placeholder: "e.g. penicillin, latex" },
    { key: "medications", label: "Current medication", type: "textarea", placeholder: "e.g. anticoagulants, bisphosphonates" },
    { key: "medicalNotes", label: "Medical history", type: "textarea", placeholder: "Conditions the dentist must know about" },
  ]
}

export function TagsCard({ patient, canEdit, onSaved }: { patient: PatientRecordData; canEdit: boolean; onSaved: () => void }) {
  const [tag, setTag] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function save(tags: string[]) {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/patients/${patient.id}/profile`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ tags }) })
    setBusy(false)
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Could not save")
    else {
      setTag("")
      onSaved()
    }
  }
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100"><Tag className="h-4 w-4 text-slate-400" />Tags</h3>
      <div className="flex flex-wrap gap-1.5">
        {patient.tags.length === 0 && <span className="text-sm text-slate-400">No tags.</span>}
        {patient.tags.map((t) => (
          <span key={t} className="inline-flex max-w-full items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <span className="break-words">{t}</span>
            {canEdit && <button type="button" aria-label={`Remove ${t}`} disabled={busy} onClick={() => save(patient.tags.filter((x) => x !== t))} className="text-slate-400 hover:text-red-600"><X className="h-3 w-3" /></button>}
          </span>
        ))}
      </div>
      {canEdit && (
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (tag.trim() && !patient.tags.includes(tag.trim())) void save([...patient.tags, tag.trim()]) }}>
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add a tag (VIP, Ortodontia…)" maxLength={200} className="h-8 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-sm dark:border-slate-600 dark:bg-slate-800" />
          <Button type="submit" size="sm" variant="outline" disabled={busy || !tag.trim()} className="gap-1">{busy ? <Loader2 className="animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Add</Button>
        </form>
      )}
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </section>
  )
}

const CONSENTS: [string, string][] = [
  ["remindersSms", "SMS appointment reminders"],
  ["remindersEmail", "Email appointment reminders"],
  ["appointments", "Appointment management"],
  ["campaigns", "Marketing campaigns"],
  ["customerRecords", "Clinical records"],
  ["sharePhotos", "Share photos"],
  ["sharePhotosNoFace", "Share photos (no face)"],
  ["survey", "Satisfaction surveys"],
]

export function ConsentsCard({ patient, canEdit, onSaved }: { patient: PatientRecordData; canEdit: boolean; onSaved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const c = patient.consents ?? {}
  async function set(key: string, value: boolean) {
    setBusy(key)
    setError(null)
    const res = await fetch(`/api/patients/${patient.id}/profile`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ consents: { [key]: value } }) })
    setBusy(null)
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Could not save")
    else onSaved()
  }
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100"><ShieldCheck className="h-4 w-4 text-slate-400" />Consents (GDPR)</h3>
      <p className="mb-3 text-xs text-slate-500">{typeof c.updatedAt === "string" ? `Last updated ${new Date(c.updatedAt).toLocaleDateString("en-GB")}. ` : ""}Reminders are only sent on channels the patient allows.</p>
      <ul className="grid gap-1.5">
        {CONSENTS.map(([k, label]) => {
          const v = k === "remindersSms" ? patient.smsRemindersEnabled : k === "remindersEmail" ? patient.emailRemindersEnabled : ((c[k] as boolean | null | undefined) ?? null)
          return (
            <li key={k} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-700 dark:text-slate-300">{label}</span>
              <span className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" role="group" aria-label={label}>
                {([true, false] as const).map((choice) => (
                  <button
                    key={String(choice)}
                    type="button"
                    disabled={!canEdit || busy !== null}
                    aria-pressed={v === choice}
                    onClick={() => set(k, choice)}
                    className={`rounded-md px-2.5 py-0.5 text-xs font-medium ${v === choice ? (choice ? "bg-emerald-600 text-white" : "bg-red-600 text-white") : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                  >
                    {busy === k && v !== choice ? "…" : choice ? "Yes" : "No"}
                  </button>
                ))}
              </span>
            </li>
          )
        })}
      </ul>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  )
}

export function DetailsPanel({ patient, options, canEdit, onSave, onSaved }: { patient: PatientRecordData; options: ClinicOptions | null; canEdit: boolean; onSave: SaveFields; onSaved: () => void }) {
  const values = patient as unknown as Record<string, unknown>
  const minor = patient.dateOfBirth ? ageFrom(patient.dateOfBirth) < 18 : false
  const showGuardian = minor || !!(patient.parentName || patient.parentPhone || patient.parentEmail)
  const identity: FieldSpec[] = [
    { key: "firstName", label: "First name" },
    { key: "lastName", label: "Surname(s)" },
    { key: "dateOfBirth", label: "Date of birth", type: "date", display: (v) => (typeof v === "string" && v ? `${new Date(v).toLocaleDateString("en-GB", { timeZone: "UTC" })} · ${ageFrom(v)} y` : null) },
    ...(!patient.dateOfBirth
      ? [
          { key: "birthDay", label: "Birthday — day (year unknown)", type: "select" as const, options: Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })) },
          { key: "birthMonth", label: "Birthday — month", type: "select" as const, options: MONTHS.map((m, i) => ({ value: String(i + 1), label: m })), display: (v: unknown) => (typeof v === "number" && v >= 1 && v <= 12 ? MONTHS[v - 1] : null) },
        ]
      : []),
    { key: "gender", label: "Gender", type: "select", options: GENDER },
    { key: "nif", label: "NIF" },
    { key: "preferredProvider", label: "Usual dentist", type: "select", options: options?.providers.map((p) => ({ value: p.name, label: p.name })) ?? [] },
    { key: "preferredLanguage", label: "Language" },
  ]
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <EditableCard title="Identity" icon={<IdCard className="h-4 w-4 text-slate-400" />} fields={identity} values={values} canEdit={canEdit} onSave={onSave}
        footer={<p className="mt-3 text-xs text-slate-400">{zappyNumber(patient.externalId) ? `Zappy nº ${zappyNumber(patient.externalId)} · ` : patient.externalId?.startsWith("zappy:") ? "Imported from Zappy · " : ""}Patient since {new Date(patient.patientSince).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>} />
      <EditableCard title="Contact" icon={<Contact className="h-4 w-4 text-slate-400" />} fields={contactFields()} values={values} canEdit={canEdit} onSave={onSave} />
      <EditableCard title="Medical" icon={<HeartPulse className="h-4 w-4 text-red-500" />} tone={patient.allergies?.trim() ? "alert" : "default"} fields={medicalFields()} values={values} canEdit={canEdit} onSave={onSave} />
      <EditableCard title="Address" icon={<Home className="h-4 w-4 text-slate-400" />} fields={[{ key: "address", label: "Street", wide: true }, { key: "zipCode", label: "Postal code" }, { key: "city", label: "Town / city" }]} values={values} canEdit={canEdit} onSave={onSave} />
      <EditableCard title="Invoicing & insurance" icon={<Briefcase className="h-4 w-4 text-slate-400" />}
        fields={[{ key: "invoiceName", label: "Name on invoices" }, { key: "invoiceNotes", label: "Invoice notes" }, { key: "insuranceProvider", label: "Insurer / agreement" }, { key: "insuranceId", label: "Member number" }]}
        values={values} canEdit={canEdit} onSave={onSave} />
      <EditableCard title="Origin & emergency contact" icon={<UserRound className="h-4 w-4 text-slate-400" />}
        fields={[{ key: "clientSource", label: "How they found us" }, { key: "referredBy", label: "Referred by" }, { key: "emergencyContact", label: "Emergency contact" }, { key: "emergencyPhone", label: "Emergency phone", type: "tel", display: tel }]}
        values={values} canEdit={canEdit} onSave={onSave} />
      {showGuardian && (
        <EditableCard title={minor ? "Parent / guardian (minor)" : "Parent / guardian"} icon={<UserRound className="h-4 w-4 text-slate-400" />}
          fields={[{ key: "parentName", label: "Name" }, { key: "parentRelation", label: "Relationship" }, { key: "parentPhone", label: "Phone", type: "tel", display: tel }, { key: "parentEmail", label: "Email", type: "email" }]}
          values={values} canEdit={canEdit} onSave={onSave} />
      )}
      <EditableCard title="Record status" icon={<IdCard className="h-4 w-4 text-slate-400" />} fields={[{ key: "status", label: "Status", type: "select", options: STATUS }]} values={values} canEdit={canEdit} onSave={onSave} />
      <TagsCard patient={patient} canEdit={canEdit} onSaved={onSaved} />
      <ConsentsCard patient={patient} canEdit={canEdit} onSaved={onSaved} />
    </div>
  )
}
