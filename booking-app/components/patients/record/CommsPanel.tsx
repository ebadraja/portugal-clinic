"use client"

/** Everything said to or by the patient: Acácia calls (with recording) and the confirmations / reminders sent. */
import { useState } from "react"
import { Mail, MessageSquare, PhoneCall } from "lucide-react"
import { fmtDateTime, type PatientRecordData } from "./types"

type Item =
  | { kind: "call"; at: string; call: PatientRecordData["callLogs"][number] }
  | { kind: "message"; at: string; message: PatientRecordData["notifications"][number] }

const MESSAGE_KIND: Record<string, string> = {
  CONFIRMATION: "Booking confirmation",
  REMINDER_DAY_BEFORE: "Reminder (day before)",
  REMINDER_HOURS_BEFORE: "Reminder (same day)",
  RESCHEDULED: "Rescheduled notice",
  CANCELLED: "Cancellation notice",
}

export function CommsPanel({ patient }: { patient: PatientRecordData }) {
  const [playing, setPlaying] = useState<string | null>(null)

  const items: Item[] = [
    ...patient.callLogs.map((call) => ({ kind: "call" as const, at: call.startTime, call })),
    ...patient.notifications.map((message) => ({ kind: "message" as const, at: message.sentAt ?? message.sendAt, message })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <div className="grid gap-3">
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
        {patient.callLogs.length} call{patient.callLogs.length === 1 ? "" : "s"} · {patient.notifications.length} message{patient.notifications.length === 1 ? "" : "s"} sent
      </div>
      {items.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No calls or messages yet.</p>}
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
          const m = it.message
          const failed = m.status === "FAILED" || m.deliveryStatus === "undelivered" || m.deliveryStatus === "failed"
          const Icon = m.channel === "EMAIL" ? Mail : MessageSquare
          return (
            <li key={`m${m.id}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 p-3 text-sm dark:border-slate-800">
              <Icon className={`h-4 w-4 ${failed ? "text-red-600" : "text-emerald-600"}`} />
              <span className="min-w-0 flex-1 truncate font-medium text-slate-900 dark:text-slate-100">{MESSAGE_KIND[m.kind] ?? m.kind} · {m.channel === "EMAIL" ? "email" : "SMS"}</span>
              <span className="text-slate-500">{fmtDateTime(m.sentAt ?? m.sendAt)}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs ${failed ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                {failed ? "Failed" : m.deliveryStatus === "delivered" ? "Delivered" : "Sent"}
              </span>
              {m.error && <p className="w-full text-xs text-red-600">{m.error}</p>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
