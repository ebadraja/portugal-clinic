"use client"

/**
 * Patients → "Import from Zappy": upload the Zappy CSV export(s), check the preview, map unknown
 * services/staff, then import. Large files are imported in rounds (each request ~45 s); the
 * dialog repeats them until the server says it's complete. Safe to run again at cutover.
 */
import { useEffect, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

type Row = { file: string; row: number; action: string; entity: string; externalId: string; name: string; detail: string }
type Result = {
  commit: boolean
  complete: boolean
  clients: { rows: number; columns: Record<string, string>; unused: string[] } | null
  bookings: { rows: number; files: number; columns: Record<string, string>; unused: string[] } | null
  counts: Record<string, number>
  report: Row[]
  problems: Row[]
  problemCount: number
  bookingStatuses: Record<string, number>
  unknownServices: { name: string; count: number; guess: string | null }[]
  unknownStaff: { name: string; count: number; guess: string | null }[]
  upcomingPerDay: { date: string; count: number }[]
  missingFromExport: number
  nextOnlyOnClients: { missing: number; created: number }
  remindersPlanned: { appointments: number; messages: number } | null
}
type Mapping = { services: Record<string, string>; staff: Record<string, string>; defaultType: string; defaultProviderId: string | null }
type Options = { types: { type: string; label: string }[]; providers: { id: string; name: string }[] }

/** Common Portuguese dental service names (same as scripts/zappy-map.example.json). */
const DEFAULT_SERVICES: Record<string, string> = {
  "Consulta de avaliação": "EVALUATION", "Primeira consulta": "EVALUATION", Consulta: "CONSULTATION", "Destartarização": "HYGIENE",
  "Higiene oral": "HYGIENE", Limpeza: "HYGIENE", "Restauração": "RESTORATIVE", "Obturação": "RESTORATIVE", "Desvitalização": "ENDODONTICS",
  Endodontia: "ENDODONTICS", Implante: "IMPLANT", Ortodontia: "ORTHODONTICS", "Consulta de ortodontia": "ORTHODONTICS", Branqueamento: "AESTHETICS",
  "Extração": "SURGERY", "Urgência": "EMERGENCY", Controlo: "FOLLOW_UP", "Revisão": "FOLLOW_UP",
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

/** "Ana Nunes" ↔ "Dra. Ana Nunes" */
function guessProvider(staff: string, providers: Options["providers"]): string | null {
  const s = fold(staff).split(" ").filter((w) => w.length > 2)
  let best: { id: string; score: number } | null = null
  for (const p of providers) {
    const words = fold(p.name).split(" ")
    const score = s.filter((w) => words.includes(w)).length
    if (score > 0 && (!best || score > best.score)) best = { id: p.id, score }
  }
  return best?.id ?? null
}

function loadMapping(): Mapping {
  try {
    const raw = localStorage.getItem("zappy.mapping")
    if (raw) return { ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return { services: { ...DEFAULT_SERVICES }, staff: {}, defaultType: "OTHER", defaultProviderId: null }
}

function saveMapping(m: Mapping) {
  try {
    localStorage.setItem("zappy.mapping", JSON.stringify(m))
  } catch {
    /* ignore */
  }
}

function downloadCsv(name: string, rows: Row[]) {
  const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const text = ["file;row;action;entity;externalId;name;detail", ...rows.map((r) => [r.file, r.row, r.action, r.entity, r.externalId, r.name, r.detail].map((v) => esc(String(v))).join(";"))].join("\n")
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const n = (r: Result | null, k: string) => r?.counts[k] ?? 0

export function ZappyImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [clients, setClients] = useState<File | null>(null)
  const [bookings, setBookings] = useState<File[]>([])
  const [mapping, setMapping] = useState<Mapping>(loadMapping)
  const [createNext, setCreateNext] = useState(false)
  const [cancelMissing, setCancelMissing] = useState(false)
  const [options, setOptions] = useState<Options | null>(null)
  const [preview, setPreview] = useState<Result | null>(null)
  const [phase, setPhase] = useState<"pick" | "checking" | "preview" | "importing" | "done">("pick")
  const [error, setError] = useState<string | null>(null)
  const [rounds, setRounds] = useState(0)
  const [totals, setTotals] = useState<Record<string, number>>({})
  const [final, setFinal] = useState<Result | null>(null)
  const [stopping, setStopping] = useState(false)
  /** Read inside the import loop, between rounds. */
  const stopRef = useRef(false)

  useEffect(() => {
    if (!open || options) return
    fetch("/api/settings/clinic")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setOptions({
        types: (d.appointmentTypes ?? []).filter((t: { active: boolean }) => t.active).map((t: { type: string; label: string }) => ({ type: t.type, label: t.label })),
        providers: (d.providers ?? []).filter((p: { active: boolean }) => p.active).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
      }))
      .catch(() => {})
  }, [open, options])

  const totalBytes = (clients?.size ?? 0) + bookings.reduce((n, f) => n + f.size, 0)
  const tooBig = [clients, ...bookings].some((f) => f && f.size > 4 * 1024 * 1024) || totalBytes > 4.4 * 1024 * 1024

  async function send(commit: boolean): Promise<Result> {
    const fd = new FormData()
    if (clients) fd.append("clients", clients)
    for (const b of bookings) fd.append("bookings", b)
    fd.append("map", JSON.stringify(mapping))
    if (commit) fd.append("commit", "1")
    if (createNext) fd.append("createNextFromClients", "1")
    if (cancelMissing) fd.append("cancelMissing", "1")
    const res = await fetch("/api/patients/import/zappy", { method: "POST", body: fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? `Import failed (${res.status})`)
    return data
  }

  async function check() {
    setPhase("checking")
    setError(null)
    saveMapping(mapping)
    try {
      const r = await send(false)
      // Pre-fill the dentist for staff names that obviously match.
      if (options && r.unknownStaff.length) {
        const staff = { ...mapping.staff }
        for (const s of r.unknownStaff) {
          const g = s.guess ?? guessProvider(s.name, options.providers)
          if (g && !staff[s.name]) staff[s.name] = g
        }
        if (Object.keys(staff).length !== Object.keys(mapping.staff).length) setMapping({ ...mapping, staff })
      }
      setPreview(r)
      setPhase("preview")
    } catch (e) {
      setError((e as Error).message)
      setPhase(preview ? "preview" : "pick")
    }
  }

  async function runImport() {
    setPhase("importing")
    setError(null)
    stopRef.current = false
    setStopping(false)
    setRounds(0)
    setTotals({})
    saveMapping(mapping)
    const sum: Record<string, number> = {}
    try {
      // Thousands of appointments take many ~45 s rounds; each round saves its work.
      for (let i = 1; i <= 200; i++) {
        setRounds(i)
        const r = await send(true)
        for (const [k, v] of Object.entries(r.counts)) if (!k.endsWith(".unchanged")) sum[k] = (sum[k] ?? 0) + v
        setTotals({ ...sum })
        if (r.complete) {
          setFinal(r)
          setPhase("done")
          onImported()
          return
        }
        if (stopRef.current) throw new Error("Stopped. Everything imported so far is saved — run the import again to continue.")
      }
      throw new Error("The import is taking unusually long. Everything so far is saved — run it again to continue.")
    } catch (e) {
      setError((e as Error).message)
      setPhase("preview")
      onImported()
    }
  }
  function reset() {
    setClients(null)
    setBookings([])
    setPreview(null)
    setFinal(null)
    setError(null)
    setPhase("pick")
  }

  const typeOptions = options?.types ?? []
  const providerOptions = options?.providers ?? []
  const selectCls = "h-8 rounded-md border border-input bg-background px-2 text-xs dark:bg-input/30"
  const patientsToWrite = n(preview, "clients.created") + n(preview, "clients.updated") + n(preview, "clients.merged") + n(preview, "clients.createdFromBooking")
  const apptsToWrite = n(preview, "bookings.created") + n(preview, "bookings.updated") + (createNext ? preview?.nextOnlyOnClients.missing ?? 0 : 0)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && phase !== "importing" && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-blue-600" /> Import from Zappy</DialogTitle>
          <DialogDescription>Upload Zappy&apos;s CSV export. You see exactly what will happen before anything is saved, and running it again later only updates what changed.</DialogDescription>
        </DialogHeader>

        {(phase === "pick" || phase === "checking") && (
          <div className="grid gap-4">
            <ol className="list-decimal space-y-1 rounded-lg bg-slate-50 p-3 pl-7 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
              <li>In Zappy: <strong>customers → export</strong>. Open the file in Excel and choose <strong>Save As → CSV UTF-8</strong>.</li>
              <li>
                Appointments: <strong>reports → MARKINGS</strong>, FILTER <strong>ALL MARKINGS</strong>, category and contributor <strong>All</strong>, then SEARCH → EXPORT.
                Zappy allows 3 months per export — export each 3-month period and choose all the files here at once. Overlapping dates are fine.
              </li>
            </ol>
            <label className="grid cursor-pointer gap-1.5 rounded-xl border-2 border-dashed border-slate-300 p-4 text-sm hover:border-blue-400 dark:border-slate-700">
              <span className="font-medium">Clients export (CSV)</span>
              <span className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <Upload className="h-4 w-4" />
                {clients ? `${clients.name} · ${(clients.size / 1024).toFixed(0)} KB` : "Choose a .csv file"}
              </span>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => setClients(e.target.files?.[0] ?? null)} />
            </label>
            <label className="grid cursor-pointer gap-1.5 rounded-xl border-2 border-dashed border-slate-300 p-4 text-sm hover:border-blue-400 dark:border-slate-700">
              <span className="font-medium">Appointment exports (CSV, optional — select several)</span>
              <span className="flex items-start gap-2 text-slate-600 dark:text-slate-400">
                <Upload className="mt-0.5 h-4 w-4 shrink-0" />
                {bookings.length ? (
                  <span className="grid">
                    {bookings.map((f) => <span key={f.name}>{f.name} · {(f.size / 1024).toFixed(0)} KB</span>)}
                  </span>
                ) : "Choose one or more .csv files"}
              </span>
              <input type="file" accept=".csv,text/csv,.txt,.tsv" multiple className="sr-only" onChange={(e) => setBookings(Array.from(e.target.files ?? []))} />
            </label>
            {tooBig && <p className="text-sm text-red-600">Too much to upload at once (4 MB in total). Choose fewer appointment files now and the rest in a second import — re-importing is safe.</p>}
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={check} disabled={(!clients && bookings.length === 0) || tooBig || phase === "checking"} className="min-w-36">
                {phase === "checking" ? <><Loader2 className="animate-spin" /> Checking…</> : "Check files"}
              </Button>
            </div>
          </div>
        )}

        {(phase === "preview" || phase === "importing") && preview && (
          <div className="grid gap-4 text-sm">
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
              Preview only — nothing has been saved yet.
            </p>

            {preview.clients && (
              <section className="grid gap-2">
                <h3 className="font-semibold">Patients <span className="font-normal text-muted-foreground">· {preview.clients.rows} rows · {Object.keys(preview.clients.columns).length} columns recognised</span></h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["New", n(preview, "clients.created"), "text-emerald-700"],
                    ["Updated", n(preview, "clients.updated"), "text-blue-700"],
                    ["Linked to an existing record", n(preview, "clients.merged"), "text-blue-700"],
                    ["Already up to date", n(preview, "clients.unchanged"), "text-slate-500"],
                    ["Duplicates in Zappy (skipped)", n(preview, "clients.duplicate"), "text-amber-700"],
                    ["Rejected (no name)", n(preview, "clients.rejected"), "text-red-700"],
                    ["Notes to add", n(preview, "clients.notes"), "text-slate-700"],
                    ["Follow-up calls", n(preview, "clients.followUps"), "text-slate-700"],
                  ].map(([label, value, cls]) => (
                    <div key={label as string} className="rounded-lg border border-border p-2">
                      <div className={`text-lg font-semibold tabular-nums ${cls}`}>{value as number}</div>
                      <div className="text-xs text-muted-foreground">{label as string}</div>
                    </div>
                  ))}
                </div>
                {preview.clients.unused.length > 0 && <p className="text-xs text-muted-foreground">Not imported: {preview.clients.unused.join(", ")}</p>}
              </section>
            )}

            {preview.bookings && (
              <section className="grid gap-2">
                <h3 className="font-semibold">Appointments <span className="font-normal text-muted-foreground">· {preview.bookings.rows} rows{preview.bookings.files > 1 ? ` in ${preview.bookings.files} files` : ""}</span></h3>
                <p className="text-muted-foreground">
                  {n(preview, "bookings.created")} new · {n(preview, "bookings.updated")} updated · {n(preview, "bookings.unchanged")} up to date
                  {n(preview, "bookings.rejected") > 0 && <span className="text-red-700"> · {n(preview, "bookings.rejected")} rejected</span>}
                  {" · "}{Object.entries(preview.bookingStatuses).map(([k, v]) => `${v} ${k === "NO_SHOW" ? "no-show" : k.toLowerCase()}`).join(", ")}
                </p>
                {(n(preview, "bookings.waitlist") + n(preview, "bookings.personalTime") + n(preview, "bookings.skippedStaff") + n(preview, "bookings.duplicateRow") + n(preview, "clients.createdFromBooking")) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {[
                      n(preview, "bookings.waitlist") ? `${n(preview, "bookings.waitlist")} on Zappy's waiting list (upcoming ones join the CRM waiting list)` : "",
                      n(preview, "bookings.personalTime") ? `${n(preview, "bookings.personalTime")} personal time (not imported — use Block time)` : "",
                      n(preview, "bookings.skippedStaff") ? `${n(preview, "bookings.skippedStaff")} in columns set to “Don't import”` : "",
                      n(preview, "bookings.duplicateRow") ? `${n(preview, "bookings.duplicateRow")} repeated (same booking in two files or twice in Zappy)` : "",
                      n(preview, "clients.createdFromBooking") ? `${n(preview, "clients.createdFromBooking")} patient(s) only in the appointment files${n(preview, "clients.ambiguousName") ? ` — ${n(preview, "clients.ambiguousName")} of them share a name with existing patients (see rows to look at)` : ""}` : "",
                    ].filter(Boolean).join(" · ")}
                  </p>
                )}
                {preview.bookings.unused.length > 0 && <p className="text-xs text-muted-foreground">Not imported: {preview.bookings.unused.join(", ")}</p>}
              </section>
            )}

            {(preview.unknownServices.length > 0 || preview.unknownStaff.length > 0) && (
              <section className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                <h3 className="font-semibold">Match Zappy names to the CRM</h3>
                {preview.unknownServices.map((s) => (
                  <div key={s.name} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{s.name} <span className="text-muted-foreground">({s.count})</span></span>
                    <select className={selectCls} value={mapping.services[s.name] ?? s.guess ?? mapping.defaultType} onChange={(e) => setMapping({ ...mapping, services: { ...mapping.services, [s.name]: e.target.value } })} aria-label={`Type for ${s.name}`}>
                      {typeOptions.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
                      {!typeOptions.some((t) => t.type === "OTHER") && <option value="OTHER">Other</option>}
                      {(() => {
                        const v = mapping.services[s.name] ?? s.guess
                        return v && v !== "OTHER" && !typeOptions.some((t) => t.type === v) ? <option value={v}>{v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ")} (switched off in Settings)</option> : null
                      })()}
                    </select>
                  </div>
                ))}
                {preview.unknownStaff.map((s) => (
                  <div key={s.name} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{s.name} <span className="text-muted-foreground">({s.count})</span></span>
                    <select className={selectCls} value={mapping.staff[s.name] ?? ""} onChange={(e) => {
                      const staff = { ...mapping.staff }
                      if (e.target.value) staff[s.name] = e.target.value
                      else delete staff[s.name]
                      setMapping({ ...mapping, staff })
                    }} aria-label={`Dentist for ${s.name}`}>
                      <option value="">No dentist (own column)</option>
                      <option value="__skip">Don&apos;t import (reminders, not patients)</option>
                      {providerOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Services show the type the CRM guessed from the name and Zappy&apos;s category. Missing a dentist? Add them in Settings → Dentists first.
                  Choices are remembered for the next import. Press “Check again” to see them applied.
                </p>
              </section>
            )}

            {(preview.nextOnlyOnClients.missing > 0 || preview.missingFromExport > 0) && (
              <section className="grid gap-2">
                {preview.nextOnlyOnClients.missing > 0 && (
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" checked={createNext} onChange={(e) => setCreateNext(e.target.checked)} />
                    <span>
                      Create the <strong>{preview.nextOnlyOnClients.missing}</strong> upcoming appointment(s) Zappy shows on patient records but that aren&apos;t in an appointment list.
                      <span className="block text-xs text-muted-foreground">
                        They are booked as
                        <select className={`${selectCls} mx-1`} value={mapping.defaultType} onChange={(e) => setMapping({ ...mapping, defaultType: e.target.value })} aria-label="Default type">
                          {typeOptions.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
                        </select>
                        with
                        <select className={`${selectCls} mx-1`} value={mapping.defaultProviderId ?? ""} onChange={(e) => setMapping({ ...mapping, defaultProviderId: e.target.value || null })} aria-label="Default dentist">
                          <option value="">no dentist</option>
                          {providerOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        — check them in the agenda afterwards.
                      </span>
                    </span>
                  </label>
                )}
                {preview.missingFromExport > 0 && (
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" checked={cancelMissing} onChange={(e) => setCancelMissing(e.target.checked)} />
                    <span>Cancel the <strong>{preview.missingFromExport}</strong> upcoming appointment(s) imported earlier that are no longer in Zappy.</span>
                  </label>
                )}
              </section>
            )}

            {preview.problemCount > 0 && (
              <section className="grid gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-600" /> {preview.problemCount} row(s) to look at</h3>
                  <Button size="sm" variant="outline" onClick={() => downloadCsv("zappy-import-problems.csv", preview.problems)} className="gap-1"><Download className="h-3.5 w-3.5" />Download</Button>
                </div>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted text-left"><tr><th className="px-2 py-1">Row</th><th className="px-2 py-1">Name</th><th className="px-2 py-1">What</th></tr></thead>
                    <tbody>
                      {preview.problems.slice(0, 200).map((p, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-2 py-1 tabular-nums text-muted-foreground">{p.file.startsWith("bookings") ? `Appt${p.file.length > 8 ? ` file ${p.file.slice(8)}` : ""} ` : ""}{p.row || "—"}</td>
                          <td className="px-2 py-1">{p.name || p.externalId}</td>
                          <td className="px-2 py-1">{p.action === "duplicate" || p.action === "reject" || p.action === "error" ? <strong>{p.action}: </strong> : null}{p.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">Bad phone numbers, invalid NIFs and impossible dates are left empty — never guessed. The rest of each row is still imported.</p>
              </section>
            )}

            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p>}

            {phase === "importing" ? (
              <div className="grid gap-2 rounded-lg border border-border p-3">
                <p className="flex items-center gap-2 font-medium"><Loader2 className="h-4 w-4 animate-spin" /> Importing… (round {rounds})</p>
                <p className="text-xs text-muted-foreground">
                  {(totals["clients.created"] ?? 0) + (totals["clients.createdFromBooking"] ?? 0)} patients created · {(totals["clients.updated"] ?? 0) + (totals["clients.merged"] ?? 0)} updated · {totals["bookings.created"] ?? 0} appointments created so far.
                  Keep this window open; large files take a few rounds.
                </p>
                <Button size="sm" variant="ghost" className="justify-self-end" disabled={stopping} onClick={() => { stopRef.current = true; setStopping(true) }}>
                  {stopping ? "Stopping after this round…" : "Stop after this round"}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={reset}>Choose other files</Button>
                <Button variant="outline" onClick={check}>Check again</Button>
                <Button onClick={runImport} disabled={patientsToWrite + apptsToWrite === 0} className="min-w-40">
                  Import {patientsToWrite} patient{patientsToWrite === 1 ? "" : "s"}{preview.bookings || createNext ? ` and ${apptsToWrite} appointment${apptsToWrite === 1 ? "" : "s"}` : ""}
                </Button>
              </div>
            )}
          </div>
        )}

        {phase === "done" && final && (
          <div className="grid gap-3 text-sm">
            <p className="flex items-center gap-2 text-base font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-5 w-5" /> Import complete</p>
            <ul className="grid gap-1">
              <li>{(totals["clients.created"] ?? 0) + (totals["clients.createdFromBooking"] ?? 0)} patients created, {(totals["clients.updated"] ?? 0) + (totals["clients.merged"] ?? 0)} updated or linked</li>
              {(totals["clients.notes"] ?? 0) > 0 && <li>{totals["clients.notes"]} patients got their Zappy notes</li>}
              {(totals["clients.followUps"] ?? 0) > 0 && <li>{totals["clients.followUps"]} follow-up calls added to Callbacks</li>}
              {(final.bookings || final.nextOnlyOnClients.created > 0) && <li>{(totals["bookings.created"] ?? 0) + final.nextOnlyOnClients.created} appointments created, {totals["bookings.updated"] ?? 0} updated</li>}
              {final.remindersPlanned && <li>Reminders planned for {final.remindersPlanned.appointments} upcoming appointment(s)</li>}
            </ul>
            <p className="text-xs text-muted-foreground">Imported appointments never message patients. Running the import again later (e.g. on cutover day) only updates what changed.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>Import more</Button>
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
