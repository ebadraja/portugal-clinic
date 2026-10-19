"use client"

/**
 * Clinical alerts, tags (Zappy "segmentos"), extra contacts, invoice details and GDPR consents
 * for one patient. Saves through PATCH /api/patients/[id]/profile (validated; changing a
 * reminder consent re-plans the patient's reminders).
 */
import { useMemo, useState } from "react"
import { AlertTriangle, Check, Loader2, Plus, ShieldCheck, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { clinicalAlerts } from "@/lib/patients/alerts"

export type ProfileFields = {
  id: string
  allergies: string | null
  medicalNotes: string | null
  tags: string[]
  phone: string | null
  phoneNote: string | null
  phone2: string | null
  phone2Note: string | null
  nif: string | null
  invoiceName: string | null
  invoiceNotes: string | null
  referredBy: string | null
  clientSource: string | null
  birthDay: number | null
  birthMonth: number | null
  dateOfBirth: string | null
  smsRemindersEnabled: boolean
  emailRemindersEnabled: boolean
  consents: Record<string, boolean | string | null> | null
  externalId: string | null
}

const CONSENTS: [string, string][] = [
  ["appointments", "Appointment management"],
  ["remindersSms", "SMS reminders"],
  ["remindersEmail", "Email reminders"],
  ["campaigns", "Marketing campaigns"],
  ["customerRecords", "Clinical/customer records"],
  ["sharePhotos", "Share photos"],
  ["sharePhotosNoFace", "Share photos (no face)"],
  ["survey", "Satisfaction surveys"],
]

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function PatientProfilePanel({ patient, canEdit, onSaved }: { patient: ProfileFields; canEdit: boolean; onSaved: (p: Partial<ProfileFields>) => void }) {
  const [draft, setDraft] = useState(patient)
  const [newTag, setNewTag] = useState("")
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const alerts = useMemo(() => clinicalAlerts(draft), [draft])

  async function save(section: string, body: Record<string, unknown>) {
    setSaving(section)
    setMessage(null)
    try {
      const res = await fetch(`/api/patients/${patient.id}/profile`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Could not save")
      setDraft((d) => ({ ...d, ...data }))
      onSaved(data)
      setMessage({ ok: true, text: "Saved." })
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message })
    } finally {
      setSaving(null)
    }
  }

  const addTag = () => {
    const t = newTag.trim()
    if (!t || draft.tags.includes(t)) return
    const tags = [...draft.tags, t]
    setNewTag("")
    void save("tags", { tags })
  }
  const removeTag = (t: string) => void save("tags", { tags: draft.tags.filter((x) => x !== t) })

  const field = (k: keyof ProfileFields, label: string, placeholder = "") => (
    <label className="grid gap-1 text-xs">
      <span className="font-medium text-slate-600 dark:text-slate-400">{label}</span>
      <Input
        value={(draft[k] as string | null) ?? ""}
        placeholder={placeholder}
        disabled={!canEdit}
        onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
        className="h-8 text-sm dark:bg-slate-800"
      />
    </label>
  )
  const contactDirty = (["phone", "phoneNote", "phone2", "phone2Note", "nif", "invoiceName", "invoiceNotes", "referredBy", "clientSource", "birthDay", "birthMonth"] as const).some((k) => draft[k] !== patient[k])
  const consents = draft.consents ?? {}

  return (
    <div className="grid gap-4 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
      {alerts.length > 0 && (
        <div role="alert" className="grid gap-1 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
          {alerts.map((a) => (
            <p key={a.label} className="flex items-start gap-2 text-sm text-red-900 dark:text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong>{a.label}</strong> — <span className="text-red-800/80 dark:text-red-300/80">{a.source}</span></span>
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Tags &amp; segments{patient.externalId?.startsWith("zappy:") ? " (from Zappy)" : ""}</p>
        <div className="flex flex-wrap gap-1.5">
          {draft.tags.length === 0 && <span className="text-sm text-slate-400">No tags.</span>}
          {draft.tags.map((t) => (
            <span key={t} className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <span className="break-words">{t}</span>
              {canEdit && (
                <button type="button" aria-label={`Remove tag ${t}`} onClick={() => removeTag(t)} className="text-slate-400 hover:text-red-600"><X className="h-3 w-3" /></button>
              )}
            </span>
          ))}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} placeholder="Add a tag (e.g. VIP, Ortodontia, Alergia à penicilina)" className="h-8 text-sm dark:bg-slate-800" maxLength={200} />
            <Button type="button" size="sm" variant="outline" disabled={!newTag.trim() || saving !== null} onClick={addTag} className="gap-1"><Plus className="h-3.5 w-3.5" />Add</Button>
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Contacts &amp; invoicing</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("phone", "Mobile", "912 345 678")}
          {field("phoneNote", "Mobile note", "e.g. only after 18h")}
          {field("phone2", "Second phone")}
          {field("phone2Note", "Second phone note")}
          {field("nif", "NIF")}
          {field("invoiceName", "Name for invoices")}
          {field("invoiceNotes", "Invoice notes")}
          {field("referredBy", "Referred by")}
          {field("clientSource", "How they found us")}
          {!draft.dateOfBirth && (
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-slate-600 dark:text-slate-400">Birthday (year unknown)</span>
              <span className="flex gap-2">
                <select disabled={!canEdit} value={draft.birthDay ?? ""} onChange={(e) => setDraft({ ...draft, birthDay: e.target.value ? Number(e.target.value) : null })} className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm dark:bg-slate-800" aria-label="Birthday day">
                  <option value="">Day</option>
                  {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </select>
                <select disabled={!canEdit} value={draft.birthMonth ?? ""} onChange={(e) => setDraft({ ...draft, birthMonth: e.target.value ? Number(e.target.value) : null })} className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm dark:bg-slate-800" aria-label="Birthday month">
                  <option value="">Month</option>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </span>
            </label>
          )}
        </div>
        {canEdit && contactDirty && (
          <Button
            size="sm"
            className="justify-self-end"
            disabled={saving !== null}
            onClick={() =>
              save("contacts", {
                phone: draft.phone, phoneNote: draft.phoneNote, phone2: draft.phone2, phone2Note: draft.phone2Note, nif: draft.nif,
                invoiceName: draft.invoiceName, invoiceNotes: draft.invoiceNotes, referredBy: draft.referredBy, clientSource: draft.clientSource,
                ...(!draft.dateOfBirth && { birthDay: draft.birthDay, birthMonth: draft.birthMonth }),
              })
            }
          >
            {saving === "contacts" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save contacts
          </Button>
        )}
      </div>

      <div className="grid gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5" /> Consents (GDPR)
          {typeof consents.updatedAt === "string" && <span className="font-normal normal-case">· updated {new Date(consents.updatedAt).toLocaleDateString("en-GB")}</span>}
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {CONSENTS.map(([k, label]) => {
            const v = k === "remindersSms" ? draft.smsRemindersEnabled : k === "remindersEmail" ? draft.emailRemindersEnabled : (consents[k] as boolean | null | undefined) ?? null
            return (
              <div key={k} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-sm dark:bg-slate-800/60">
                <span className="text-slate-700 dark:text-slate-300">{label}</span>
                <span className="flex gap-1" role="group" aria-label={label}>
                  {([true, false] as const).map((choice) => (
                    <button
                      key={String(choice)}
                      type="button"
                      disabled={!canEdit || saving !== null}
                      aria-pressed={v === choice}
                      onClick={() => save(`consent-${k}`, { consents: { [k]: choice } })}
                      className={`rounded px-2 py-0.5 text-xs font-medium ${v === choice ? (choice ? "bg-emerald-600 text-white" : "bg-red-600 text-white") : "bg-white text-slate-500 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-700"}`}
                    >
                      {choice ? "Yes" : "No"}
                    </button>
                  ))}
                </span>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-slate-400">Reminders are only sent on channels the patient allows. Changing SMS/email reminders updates the planned reminders immediately.</p>
      </div>

      {message && (
        <p role="status" className={`flex items-center gap-1.5 text-sm ${message.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
          {message.ok ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{message.text}
        </p>
      )}
    </div>
  )
}
