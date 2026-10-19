"use client"

/** Everything said to or by the patient: Acácia calls (with recording), web chats, emails. */
import { useEffect, useState } from "react"
import { Ban, Loader2, Mail, MessageSquare, PhoneCall, RefreshCw } from "lucide-react"
import { fmtDateTime, type PatientRecordData } from "./types"

type EmailLog = {
  id: string
  status: string
  type: string
  subject: string | null
  sentAt: string | null
  createdAt: string
  errorMessage: string | null
  template: { name: string } | null
  campaign: { name: string } | null
}

type Item =
  | { kind: "call"; at: string; call: PatientRecordData["callLogs"][number] }
  | { kind: "chat"; at: string; chat: PatientRecordData["chatLogs"][number] }
  | { kind: "email"; at: string; email: EmailLog }

const EMAIL_STATUS: Record<string, string> = {
  QUEUED: "Queued", SENT: "Sent", DELIVERED: "Delivered", OPENED: "Opened", CLICKED: "Clicked", BOUNCED: "Bounced", FAILED: "Failed", UNSUBSCRIBED: "Unsubscribed",
}

export function CommsPanel({ patient, canEdit }: { patient: PatientRecordData; canEdit: boolean }) {
  const [emails, setEmails] = useState<EmailLog[] | null>(null)
  const [unsubscribed, setUnsubscribed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`/api/email/analytics/patient/${patient.id}?page=1&limit=50`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { logs: [], isUnsubscribed: false }))
      .then((d) => {
        setEmails(d.logs ?? [])
        setUnsubscribed(!!d.isUnsubscribed)
      })
      .catch(() => setEmails([]))
    return () => ctrl.abort()
  }, [patient.id])

  async function toggleUnsubscribe() {
    setBusy("unsub")
    try {
      const res = await fetch(`/api/patients/${patient.id}/unsubscribe`, { method: unsubscribed ? "DELETE" : "POST" })
      if (res.ok) setUnsubscribed(!unsubscribed)
    } finally {
      setBusy(null)
    }
  }

  async function resend(id: string) {
    setBusy(id)
    try {
      const res = await fetch(`/api/email/logs/${id}/resend`, { method: "POST" })
      if (res.ok) setEmails((list) => list?.map((e) => (e.id === id ? { ...e, status: "QUEUED" } : e)) ?? null)
    } finally {
      setBusy(null)
    }
  }

  const items: Item[] = [
    ...patient.callLogs.map((call) => ({ kind: "call" as const, at: call.startTime, call })),
    ...patient.chatLogs.map((chat) => ({ kind: "chat" as const, at: chat.startTime, chat })),
    ...(emails ?? []).map((email) => ({ kind: "email" as const, at: email.sentAt ?? email.createdAt, email })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50">
        <span className="text-slate-600 dark:text-slate-300">
          {patient.callLogs.length} call{patient.callLogs.length === 1 ? "" : "s"} · {patient.chatLogs.length} chat{patient.chatLogs.length === 1 ? "" : "s"} · {emails?.length ?? "…"} email{emails?.length === 1 ? "" : "s"}
        </span>
        {canEdit && (
          <button type="button" onClick={toggleUnsubscribe} disabled={busy === "unsub"} className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300">
            <Ban className="h-3.5 w-3.5" />
            {unsubscribed ? "Unsubscribed from campaign emails — re-subscribe" : "Unsubscribe from campaign emails"}
          </button>
        )}
      </div>
      {emails === null && <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />}
      {items.length === 0 && emails !== null && <p className="py-6 text-center text-sm text-slate-400">No calls, chats or emails yet.</p>}
      <ul className="grid gap-2">
        {items.map((it) => {
          if (it.kind === "call") {
            const c = it.call
            return (
              <li key={`c${c.id}`} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <PhoneCall className="h-4 w-4 text-blue-600" />
                  <span className="font-medium text-slate-900 dark:text-slate-100">Call with Acácia</span>
                  <span className="text-slate-500">{fmtDateTime(c.startTime)}{c.duration ? ` · ${Math.floor(c.duration / 60)}:${String(c.duration % 60).padStart(2, "0")}` : ""}</span>
                  {c.outcome && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{c.outcome.replace(/_/g, " ").toLowerCase()}</span>}
                  {c.hasRecording && (
                    <button type="button" onClick={() => setPlaying(playing === c.id ? null : c.id)} className="ml-auto text-xs font-medium text-blue-700 hover:underline dark:text-blue-300">
                      {playing === c.id ? "Hide recording" : "Play recording"}
                    </button>
                  )}
                </div>
                {c.summary && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{c.summary}</p>}
                {playing === c.id && <audio className="mt-2 w-full" controls autoPlay src={`/api/call-logs/${c.id}/recording`} />}
              </li>
            )
          }
          if (it.kind === "chat") {
            const c = it.chat
            return (
              <li key={`h${c.id}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 p-3 text-sm dark:border-slate-800">
                <MessageSquare className="h-4 w-4 text-violet-600" />
                <span className="font-medium text-slate-900 dark:text-slate-100">{c.topic ? `Chat · ${c.topic.toLowerCase()}` : "Website chat"}</span>
                <span className="text-slate-500">{fmtDateTime(c.startTime)}</span>
                {c.outcome && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-xs text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">{c.outcome.replace(/_/g, " ").toLowerCase()}</span>}
              </li>
            )
          }
          const e = it.email
          const failed = e.status === "FAILED" || e.status === "BOUNCED"
          return (
            <li key={`e${e.id}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 p-3 text-sm dark:border-slate-800">
              <Mail className={`h-4 w-4 ${failed ? "text-red-600" : "text-emerald-600"}`} />
              <span className="min-w-0 flex-1 truncate font-medium text-slate-900 dark:text-slate-100">{e.template?.name ?? e.campaign?.name ?? e.subject ?? "Email"}</span>
              <span className="text-slate-500">{fmtDateTime(e.sentAt ?? e.createdAt)}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs ${failed ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{EMAIL_STATUS[e.status] ?? e.status}</span>
              {failed && canEdit && e.type === "REMINDER" && (
                <button type="button" onClick={() => resend(e.id)} disabled={busy === e.id} className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-300">
                  <RefreshCw className="h-3.5 w-3.5" />Resend
                </button>
              )}
              {e.errorMessage && <p className="w-full text-xs text-red-600">{e.errorMessage}</p>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
