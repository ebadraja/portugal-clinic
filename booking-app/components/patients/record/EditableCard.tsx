"use client"

/**
 * A record section that reads like a card and edits in place: pencil → fields → Save/Cancel,
 * for that card only. Empty values show a quiet "—" instead of "Not set" everywhere.
 */
import { useState, type ReactNode } from "react"
import { Loader2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"

export type FieldSpec = {
  key: string
  label: string
  type?: "text" | "textarea" | "date" | "tel" | "email" | "select"
  options?: { value: string; label: string }[]
  placeholder?: string
  /** Spans both columns. */
  wide?: boolean
  /** Read-mode rendering. */
  display?: (value: unknown) => ReactNode
}

type Values = Record<string, unknown>

const inputCls =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"

function toInput(v: unknown, type: FieldSpec["type"]): string {
  if (v === null || v === undefined) return ""
  if (type === "date" && typeof v === "string") return v.slice(0, 10)
  return String(v)
}

export function EditableCard({
  title,
  icon,
  fields,
  values,
  canEdit,
  onSave,
  footer,
  tone = "default",
}: {
  title: string
  icon?: ReactNode
  fields: FieldSpec[]
  values: Values
  canEdit: boolean
  /** Return an error message, or null when saved. Receives only the changed fields. */
  onSave: (changes: Record<string, string | null>) => Promise<string | null>
  footer?: ReactNode
  tone?: "default" | "alert"
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = () => {
    setDraft(Object.fromEntries(fields.map((f) => [f.key, toInput(values[f.key], f.type)])))
    setError(null)
    setEditing(true)
  }

  async function save() {
    const changes: Record<string, string | null> = {}
    for (const f of fields) {
      const before = toInput(values[f.key], f.type)
      const after = (draft[f.key] ?? "").trim()
      if (after !== before) changes[f.key] = after === "" ? null : after
    }
    if (Object.keys(changes).length === 0) {
      setEditing(false)
      return
    }
    setSaving(true)
    const err = await onSave(changes)
    setSaving(false)
    if (err) setError(err)
    else setEditing(false)
  }

  const shell = tone === "alert"
    ? "border-red-200 bg-red-50/40 dark:border-red-900 dark:bg-red-950/20"
    : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"

  return (
    <section className={`rounded-xl border p-4 shadow-sm ${shell}`}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{icon}{title}</h3>
        {canEdit && !editing && (
          <button type="button" onClick={start} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100" aria-label={`Edit ${title}`}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        )}
      </header>

      {editing ? (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          {fields.map((f) => (
            <label key={f.key} className={`grid gap-1 text-xs ${f.wide || f.type === "textarea" ? "sm:col-span-2" : ""}`}>
              <span className="font-medium text-slate-600 dark:text-slate-400">{f.label}</span>
              {f.type === "textarea" ? (
                <textarea rows={3} value={draft[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} className={`${inputCls} h-auto py-2`} />
              ) : f.type === "select" ? (
                <select value={draft[f.key] ?? ""} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} className={inputCls}>
                  <option value="">—</option>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input type={f.type ?? "text"} value={draft[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} className={inputCls} />
              )}
            </label>
          ))}
          {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving} className="min-w-20">{saving ? <Loader2 className="animate-spin" /> : "Save"}</Button>
          </div>
        </form>
      ) : (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {fields.map((f) => {
            const v = values[f.key]
            const shown = f.display ? f.display(v) : v === null || v === undefined || v === "" ? null : f.type === "select" ? f.options?.find((o) => o.value === v)?.label ?? String(v) : String(v)
            return (
              <div key={f.key} className={f.wide || f.type === "textarea" ? "sm:col-span-2" : ""}>
                <dt className="text-xs text-slate-500 dark:text-slate-400">{f.label}</dt>
                <dd className="mt-0.5 whitespace-pre-line text-sm text-slate-900 dark:text-slate-100">{shown ?? <span className="text-slate-300 dark:text-slate-600">—</span>}</dd>
              </div>
            )
          })}
        </dl>
      )}
      {footer}
    </section>
  )
}
