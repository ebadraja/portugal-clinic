"use client"

/** Notes on the record: quick add at the top, newest first, imported Zappy notes labelled. */
import { useState } from "react"
import { Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NOTE_TYPE_LABEL, ZAPPY_NOTE_PREFIX, fmtDate, type RecordNote } from "./types"

const TYPE_CLS: Record<RecordNote["noteType"], string> = {
  GENERAL: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  MEDICAL: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  ADMINISTRATIVE: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  FOLLOW_UP: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  ALERT: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
}

export function NotesPanel({
  patientId,
  notes,
  canEdit,
  userId,
  isAdmin,
  limit,
  onChanged,
  onShowAll,
  autoFocusRef,
}: {
  patientId: string
  notes: RecordNote[]
  canEdit: boolean
  userId: string | null
  isAdmin: boolean
  /** Show only the newest N (overview). */
  limit?: number
  onChanged: () => void
  onShowAll?: () => void
  autoFocusRef?: React.RefObject<HTMLTextAreaElement | null>
}) {
  const [text, setText] = useState("")
  const [type, setType] = useState<RecordNote["noteType"]>("GENERAL")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const shown = limit ? notes.slice(0, limit) : notes

  async function add() {
    if (!text.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/patients/${patientId}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: text.trim(), noteType: type }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? "Could not save the note")
      setText("")
      setType("GENERAL")
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this note? This can't be undone.")) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/patients/${patientId}/notes/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not delete")
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="grid gap-3">
      {canEdit && (
        <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 dark:border-slate-700 dark:bg-slate-800/40">
          <textarea
            ref={autoFocusRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void add()
            }}
            rows={2}
            placeholder="Write a note… (Ctrl+Enter to save)"
            className="w-full resize-y rounded-md border-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
            aria-label="New note"
          />
          <div className="flex items-center justify-between gap-2">
            <select value={type} onChange={(e) => setType(e.target.value as RecordNote["noteType"])} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-600 dark:bg-slate-900" aria-label="Note type">
              {(Object.keys(NOTE_TYPE_LABEL) as RecordNote["noteType"][]).map((k) => <option key={k} value={k}>{NOTE_TYPE_LABEL[k]}</option>)}
            </select>
            <Button size="sm" onClick={add} disabled={saving || !text.trim()} className="min-w-20">{saving ? <Loader2 className="animate-spin" /> : "Add note"}</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      {notes.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">No notes yet.</p>
      ) : (
        <ul className="grid gap-2">
          {shown.map((n) => {
            const imported = n.content.startsWith(ZAPPY_NOTE_PREFIX)
            const body = imported ? n.content.slice(ZAPPY_NOTE_PREFIX.length) : n.content
            const mine = n.authorId === userId
            return (
              <li key={n.id} className="group rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{fmtDate(n.createdAt)}</span>
                  {imported ? <span className="rounded bg-sky-50 px-1.5 py-0.5 font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">From Zappy</span> : n.author && <span>· {n.author.firstName} {n.author.lastName}</span>}
                  {n.noteType !== "GENERAL" && n.noteType !== "ADMINISTRATIVE" && <span className={`rounded px-1.5 py-0.5 font-medium ${TYPE_CLS[n.noteType]}`}>{NOTE_TYPE_LABEL[n.noteType]}</span>}
                  {canEdit && (mine || isAdmin) && (
                    <button type="button" onClick={() => remove(n.id)} disabled={deleting === n.id} aria-label="Delete note" className="ml-auto rounded p-1 text-slate-300 opacity-0 hover:text-red-600 group-hover:opacity-100 focus:opacity-100">
                      {deleting === n.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-800 dark:text-slate-200">{body}</p>
              </li>
            )
          })}
        </ul>
      )}
      {limit && notes.length > limit && onShowAll && (
        <button type="button" onClick={onShowAll} className="justify-self-start text-sm font-medium text-blue-700 hover:underline dark:text-blue-300">
          See all {notes.length} notes
        </button>
      )}
    </div>
  )
}
