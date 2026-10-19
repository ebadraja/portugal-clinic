"use client"

import { useState } from "react"
import { Check, CalendarClock, X, Loader2 } from "lucide-react"

type State = "active" | "confirmed" | "cancelled" | "past"
type Action = "confirm" | "cancel" | "reschedule"

export function PatientLinkActions({
  token,
  initialState,
  cancellationNoticeHours,
  hoursUntil,
}: {
  token: string
  initialState: State
  cancellationNoticeHours: number
  hoursUntil: number
}) {
  const [state, setState] = useState<State>(initialState)
  const [busy, setBusy] = useState<Action | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const late = hoursUntil < cancellationNoticeHours

  async function run(action: Action) {
    setBusy(action)
    setMessage(null)
    try {
      const res = await fetch(`/api/public/appointment/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      setMessage(data.message ?? data.error ?? "Não foi possível concluir. Ligue-nos, por favor.")
      if (data.state) setState(data.state)
    } catch {
      setMessage("Sem ligação. Tente novamente ou ligue-nos.")
    } finally {
      setBusy(null)
      setConfirmCancel(false)
    }
  }

  if (state === "cancelled") {
    return <p role="status" className="mt-5 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">{message ?? "Esta consulta foi desmarcada."}</p>
  }

  return (
    <div className="mt-5 space-y-3">
      {state === "confirmed" ? (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Check className="h-4 w-4" aria-hidden /> Presença confirmada
        </p>
      ) : (
        <button
          type="button"
          onClick={() => run("confirm")}
          disabled={busy !== null}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {busy === "confirm" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Check className="h-5 w-5" aria-hidden />}
          Confirmo a minha presença
        </button>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => run("reschedule")}
          disabled={busy !== null}
          className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          {busy === "reschedule" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CalendarClock className="h-4 w-4" aria-hidden />}
          Quero remarcar
        </button>
        <button
          type="button"
          onClick={() => setConfirmCancel(true)}
          disabled={busy !== null}
          className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-red-400"
        >
          <X className="h-4 w-4" aria-hidden /> Não posso ir
        </button>
      </div>

      {confirmCancel && (
        <div role="alertdialog" aria-label="Confirmar desmarcação" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/40">
          <p className="text-red-900 dark:text-red-200">
            {late
              ? `Faltam menos de ${cancellationNoticeHours} horas. Pode desmarcar, mas a clínica será informada do aviso tardio.`
              : "Tem a certeza de que quer desmarcar esta consulta?"}
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => run("cancel")} disabled={busy !== null} className="h-9 rounded-lg bg-red-600 px-3 font-semibold text-white hover:bg-red-700 disabled:opacity-60">
              {busy === "cancel" ? "A desmarcar…" : "Sim, desmarcar"}
            </button>
            <button type="button" onClick={() => setConfirmCancel(false)} className="h-9 rounded-lg px-3 text-slate-700 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800">
              Manter consulta
            </button>
          </div>
        </div>
      )}

      {message && <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{message}</p>}
    </div>
  )
}
