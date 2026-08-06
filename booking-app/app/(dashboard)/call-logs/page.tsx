"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  format, formatDistanceToNow,
} from "date-fns"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Phone, Search, Clock, CheckCircle2, PhoneForwarded, Download,
  Calendar, HelpCircle, AlertCircle, MessageSquare, Play,
  Smile, Meh, Frown, Flag, ChevronLeft, ChevronRight,
  Shield, AlertTriangle, X, User, FileText, Loader2,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatientRef {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string
  phone: string | null
  email: string | null
}

interface AppointmentRef {
  id: string
  startTime: string
  endTime: string
  type: string
  status: string
  provider: string | null
  reason: string | null
}

interface ApiCallLog {
  id: string
  callerName: string | null
  callerPhone: string
  startTime: string
  endTime: string | null
  duration: number | null
  intent: string
  outcome: string
  sentiment: string
  transcript: string | null
  summary: string | null
  recordingUrl: string | null
  wasEscalated: boolean
  escalationReason: string | null
  transferredTo: string | null
  appointmentBooked: boolean
  patientId: string | null
  isReviewed: boolean
  flagForFollowUp: boolean
  patient: PatientRef | null
  appointment: AppointmentRef | null
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

type DatePreset = "" | "today" | "week" | "month"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—"
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

function relativeTime(iso: string): string {
  try {
    const d = new Date(iso)
    const diff = Date.now() - d.getTime()
    if (diff < 60_000) return "Just now"
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return formatDistanceToNow(d, { addSuffix: true })
    return format(d, "MMM d, h:mm a")
  } catch {
    return iso
  }
}

function avatarInitials(name: string): string {
  return name.split(" ").map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "?"
}

interface TranscriptLine { speaker: string; text: string; timestamp?: string }

function parseTranscript(raw: string): TranscriptLine[] | null {
  if (!raw.trim().startsWith("[")) return null
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr) && typeof arr[0]?.text === "string") return arr as TranscriptLine[]
  } catch { /* fall through to raw display */ }
  return null
}

function fmtAvgDuration(sec: number | null): string {
  if (sec === null) return "—"
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

// ─── Display config ───────────────────────────────────────────────────────────

const INTENT_CFG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  APPOINTMENT_BOOKING: { label: "Appointment",  icon: <Calendar className="h-3 w-3" />,      cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
  INQUIRY:             { label: "Inquiry",       icon: <HelpCircle className="h-3 w-3" />,     cls: "bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300" },
  COMPLAINT:           { label: "Complaint",     icon: <AlertCircle className="h-3 w-3" />,    cls: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
  SUPPORT:             { label: "Support",       icon: <MessageSquare className="h-3 w-3" />,  cls: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300" },
  ROUTING:             { label: "Routing",       icon: <PhoneForwarded className="h-3 w-3" />, cls: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300" },
  CANCELLATION:        { label: "Cancellation",  icon: <X className="h-3 w-3" />,              cls: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
  VERIFICATION:        { label: "Verification",  icon: <Shield className="h-3 w-3" />,         cls: "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300" },
  EMERGENCY:           { label: "Emergency",     icon: <AlertTriangle className="h-3 w-3" />,  cls: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200" },
  GENERAL:             { label: "General",       icon: <Phone className="h-3 w-3" />,          cls: "bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400" },
}

const OUTCOME_CFG: Record<string, { label: string; cls: string }> = {
  IN_PROGRESS:   { label: "In Progress", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
  BOOKED:        { label: "Booked",      cls: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" },
  INFO_PROVIDED: { label: "Info Only",   cls: "bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400" },
  TRANSFERRED:   { label: "Transferred", cls: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300" },
  HUNG_UP:       { label: "Hung Up",     cls: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
  VOICEMAIL:     { label: "Voicemail",   cls: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300" },
}

const SENTIMENT_ICON: Record<string, React.ReactNode> = {
  POSITIVE: <Smile className="w-4 h-4 text-green-600" />,
  NEUTRAL:  <Meh   className="w-4 h-4 text-slate-500" />,
  NEGATIVE: <Frown className="w-4 h-4 text-red-600"   />,
}

const INTENT_FILTERS  = ["", "APPOINTMENT_BOOKING", "INQUIRY", "COMPLAINT", "SUPPORT", "EMERGENCY"]
const OUTCOME_FILTERS = ["", "BOOKED", "TRANSFERRED", "INFO_PROVIDED", "HUNG_UP", "VOICEMAIL"]
const DATE_PRESETS: Array<[DatePreset, string]> = [["", "All Time"], ["today", "Today"], ["week", "This Week"], ["month", "This Month"]]

// ─── Micro-components ─────────────────────────────────────────────────────────

function IntentBadge({ intent }: { intent: string }) {
  const cfg = INTENT_CFG[intent] ?? INTENT_CFG.GENERAL
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  )
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const cfg = OUTCOME_CFG[outcome] ?? { label: outcome, cls: "bg-slate-100 text-slate-600" }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function SkeletonRow() {
  return (
    <tr className="border-t border-slate-100 dark:border-slate-800">
      {[40, 180, 48, 90, 80, 32, 100].map((w, i) => (
        <td key={i} className="py-3 px-4">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" style={{ width: w }} />
        </td>
      ))}
    </tr>
  )
}

// ─── Transcript dialog ────────────────────────────────────────────────────────

function TranscriptDialog({
  log, dialogLoading, actionPending, showNote, noteText,
  onClose, onMarkReviewed, onToggleFlag,
  onOpenNote, onNoteChange, onSaveNote, onCancelNote,
}: {
  log: ApiCallLog
  dialogLoading: boolean
  actionPending: string | null
  showNote: boolean
  noteText: string
  onClose: () => void
  onMarkReviewed: () => void
  onToggleFlag: () => void
  onOpenNote: () => void
  onNoteChange: (v: string) => void
  onSaveNote: () => void
  onCancelNote: () => void
}) {
  const structured = !dialogLoading && log.transcript ? parseTranscript(log.transcript) : null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center md:justify-center p-0 md:p-4">
      <div className="bg-white dark:bg-slate-900 w-full md:max-w-2xl md:rounded-2xl max-h-[92vh] md:max-h-[88vh] flex flex-col rounded-t-2xl overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-50">
              {log.callerName ?? "Unknown Caller"}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {log.callerPhone} · {format(new Date(log.startTime), "MMM d, yyyy h:mm a")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">

          {/* Meta strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: "Intent",    content: <IntentBadge intent={log.intent} /> },
              { label: "Outcome",   content: <OutcomeBadge outcome={log.outcome} /> },
              { label: "Duration",  content: <span className="font-mono text-sm font-medium text-slate-900 dark:text-slate-100">{formatDuration(log.duration)}</span> },
              { label: "Sentiment", content: <div className="flex items-center gap-1.5">{SENTIMENT_ICON[log.sentiment] ?? <Meh className="w-4 h-4 text-slate-400" />}<span className="text-sm font-medium text-slate-900 dark:text-slate-100 capitalize">{log.sentiment.toLowerCase()}</span></div> },
            ].map(({ label, content }) => (
              <div key={label} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1.5">{label}</p>
                {content}
              </div>
            ))}
          </div>

          {/* Linked patient */}
          {log.patient && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0">
                <User className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500">Linked Patient</p>
                <Link
                  href={`/patients/${log.patient.id}`}
                  className="font-medium text-blue-600 hover:underline dark:text-blue-400 text-sm"
                >
                  {log.patient.firstName} {log.patient.lastName}
                </Link>
              </div>
              {log.appointmentBooked && (
                <span className="text-xs bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full flex-shrink-0">
                  Appointment Booked
                </span>
              )}
            </div>
          )}

          {/* Linked appointment */}
          {log.appointment && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <Calendar className="h-4 w-4 text-slate-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500">Linked Appointment</p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {format(new Date(log.appointment.startTime), "MMM d, yyyy h:mm a")}
                  {log.appointment.provider && ` · ${log.appointment.provider}`}
                </p>
              </div>
              <OutcomeBadge outcome={log.appointment.status} />
            </div>
          )}

          {/* Escalation notice */}
          {log.wasEscalated && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/50">
              <PhoneForwarded className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-orange-800 dark:text-orange-300">Escalated to Staff</p>
                {log.escalationReason && <p className="text-xs text-orange-700 dark:text-orange-400 mt-0.5">{log.escalationReason}</p>}
                {log.transferredTo    && <p className="text-xs text-orange-700 dark:text-orange-400">Transferred to: {log.transferredTo}</p>}
              </div>
            </div>
          )}

          {/* Summary */}
          {log.summary && !showNote && (
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-lg p-4">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-2">Summary</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{log.summary}</p>
            </div>
          )}

          {/* Inline note editor */}
          {showNote && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Staff Note</p>
              <Textarea
                value={noteText}
                onChange={e => onNoteChange(e.target.value)}
                placeholder="Add a note or update the summary…"
                className="min-h-[80px] text-sm"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={onCancelNote}>Cancel</Button>
                <Button size="sm" onClick={onSaveNote} disabled={actionPending === "note" || !noteText.trim()}>
                  {actionPending === "note" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Save Note
                </Button>
              </div>
            </div>
          )}

          {/* Recording player */}
          {log.recordingUrl && (
            <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4 flex items-center gap-4">
              <a
                href={log.recordingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors flex-shrink-0"
              >
                <Play className="h-4 w-4 text-white fill-white" />
              </a>
              <div className="flex-1">
                <div className="bg-slate-300 dark:bg-slate-600 h-1.5 rounded-full mb-1.5" />
                <p className="text-xs text-slate-500">Call recording</p>
              </div>
            </div>
          )}

          {/* Transcript */}
          <div>
            <h4 className="font-semibold text-slate-900 dark:text-slate-50 mb-3 text-sm">Transcript</h4>
            {dialogLoading ? (
              <div className="space-y-3">
                {[120, 200, 160, 220, 140].map((w, i) => (
                  <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                    <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse" style={{ width: w }} />
                  </div>
                ))}
              </div>
            ) : !log.transcript ? (
              <p className="text-sm text-slate-400 italic">No transcript available for this call.</p>
            ) : structured ? (
              <div className="space-y-3">
                {structured.map((msg, i) => {
                  const spk = (msg.speaker ?? "").toLowerCase()
                  const isAgent = spk === "bot" || spk === "agent" || spk.includes("ai") || spk === "jenny"
                  return (
                    <div key={i} className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[80%] px-4 py-2.5 rounded-xl text-sm ${
                        isAgent
                          ? "bg-blue-100 dark:bg-blue-900/40 text-slate-800 dark:text-slate-200 rounded-bl-none"
                          : "bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-br-none"
                      }`}>
                        {isAgent && <p className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-1">Jenny (AI)</p>}
                        <p>{msg.text}</p>
                        {msg.timestamp && <p className="text-xs text-slate-400 mt-1">{msg.timestamp}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <pre className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans bg-slate-50 dark:bg-slate-800 rounded-lg p-4 leading-relaxed">
                {log.transcript}
              </pre>
            )}
          </div>
        </div>

        {/* Action bar */}
        <div className="flex-shrink-0 p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex gap-2">
          <Button
            variant="outline" size="sm"
            className="flex-1 gap-1.5 text-xs"
            onClick={onOpenNote}
            disabled={showNote}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Add Note
          </Button>
          <Button
            variant="outline" size="sm"
            className={`flex-1 gap-1.5 text-xs ${log.isReviewed ? "text-green-600 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30" : ""}`}
            onClick={onMarkReviewed}
            disabled={log.isReviewed || actionPending === "review"}
          >
            {actionPending === "review"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <CheckCircle2 className="h-3.5 w-3.5" />}
            {log.isReviewed ? "Reviewed" : "Mark Reviewed"}
          </Button>
          <Button
            variant="outline" size="sm"
            className={`flex-1 gap-1.5 text-xs ${log.flagForFollowUp ? "text-amber-600 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" : ""}`}
            onClick={onToggleFlag}
            disabled={actionPending === "flag"}
          >
            {actionPending === "flag"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Flag className="h-3.5 w-3.5" />}
            {log.flagForFollowUp ? "Flagged" : "Flag Follow-up"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CallLogsPage() {
  const [logs,       setLogs]       = useState<ApiCallLog[]>([])
  const [loading,    setLoading]    = useState(true)
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  const [search,         setSearch]         = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [filterIntent,   setFilterIntent]   = useState("")
  const [filterOutcome,  setFilterOutcome]  = useState("")
  const [datePreset,     setDatePreset]     = useState<DatePreset>("")

  // Today stats
  const [todayTotal,     setTodayTotal]     = useState<number | null>(null)
  const [todayBooked,    setTodayBooked]    = useState<number | null>(null)
  const [todayEscalated, setTodayEscalated] = useState<number | null>(null)
  const [todayAvgSec,    setTodayAvgSec]    = useState<number | null>(null)

  // Dialog
  const [selectedLog,    setSelectedLog]    = useState<ApiCallLog | null>(null)
  const [dialogLoading,  setDialogLoading]  = useState(false)
  const [actionPending,  setActionPending]  = useState<string | null>(null)
  const [showNote,       setShowNote]       = useState(false)
  const [noteText,       setNoteText]       = useState("")

  // Debounce search 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Reset page when any filter changes
  useEffect(() => { setCurrentPage(1) }, [debouncedSearch, filterIntent, filterOutcome, datePreset])

  // Fetch paginated list
  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(currentPage), limit: "20" })
      if (debouncedSearch) p.set("search", debouncedSearch)
      if (filterIntent)    p.set("intent",  filterIntent)
      if (filterOutcome)   p.set("outcome", filterOutcome)
      if (datePreset) {
        const now = new Date()
        const ranges: Record<string, [Date, Date]> = {
          today: [startOfDay(now), endOfDay(now)],
          week:  [startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 })],
          month: [startOfMonth(now), endOfMonth(now)],
        }
        const [from, to] = ranges[datePreset]
        p.set("dateFrom", from.toISOString())
        p.set("dateTo",   to.toISOString())
      }
      const res  = await fetch(`/api/call-logs?${p}`)
      const json = await res.json()
      setLogs(json.data ?? [])
      setPagination(json.pagination ?? null)
    } finally {
      setLoading(false)
    }
  }, [currentPage, debouncedSearch, filterIntent, filterOutcome, datePreset])

  useEffect(() => {
    fetchLogs()
    const id = setInterval(fetchLogs, 30_000)
    return () => clearInterval(id)
  }, [fetchLogs])

  // Today stats — fetch on mount and refresh every 60 s
  const fetchTodayStats = useCallback(() => {
    const now = new Date()
    const p = new URLSearchParams({
      dateFrom: startOfDay(now).toISOString(),
      dateTo:   endOfDay(now).toISOString(),
      limit:    "500",
    })
    fetch(`/api/call-logs?${p}`)
      .then(r => r.json())
      .then(json => {
        const data: ApiCallLog[] = json.data ?? []
        const total = (json.pagination?.total as number) ?? data.length
        setTodayTotal(total)
        setTodayBooked(data.filter(l => l.outcome === "BOOKED").length)
        setTodayEscalated(data.filter(l => l.wasEscalated).length)
        const withDur = data.filter(l => l.duration !== null)
        setTodayAvgSec(
          withDur.length
            ? withDur.reduce((s, l) => s + (l.duration ?? 0), 0) / withDur.length
            : null
        )
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchTodayStats()
    const id = setInterval(fetchTodayStats, 60_000)
    return () => clearInterval(id)
  }, [fetchTodayStats])

  // Open dialog — show partial data immediately, fetch full record for transcript/appointment
  async function openDialog(log: ApiCallLog) {
    setSelectedLog(log)
    setShowNote(false)
    setNoteText(log.summary ?? "")
    setDialogLoading(true)
    try {
      const res  = await fetch(`/api/call-logs/${log.id}`)
      const full = await res.json()
      setSelectedLog(full)
    } catch { /* keep partial data */ } finally {
      setDialogLoading(false)
    }
  }

  function closeDialog() {
    setSelectedLog(null)
    setShowNote(false)
    setNoteText("")
  }

  // PATCH helper
  async function patch(id: string, body: Record<string, unknown>): Promise<ApiCallLog> {
    const res = await fetch(`/api/call-logs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error("Update failed")
    return res.json()
  }

  function applyUpdate(updated: ApiCallLog) {
    setSelectedLog(updated)
    setLogs(prev => prev.map(l => l.id === updated.id ? updated : l))
  }

  async function handleMarkReviewed() {
    if (!selectedLog || selectedLog.isReviewed) return
    setActionPending("review")
    try { applyUpdate(await patch(selectedLog.id, { isReviewed: true })) }
    catch { /* silent */ } finally { setActionPending(null) }
  }

  async function handleToggleFlag() {
    if (!selectedLog) return
    setActionPending("flag")
    try { applyUpdate(await patch(selectedLog.id, { flagForFollowUp: !selectedLog.flagForFollowUp })) }
    catch { /* silent */ } finally { setActionPending(null) }
  }

  async function handleSaveNote() {
    if (!selectedLog || !noteText.trim()) return
    setActionPending("note")
    try {
      applyUpdate(await patch(selectedLog.id, { summary: noteText.trim() }))
      setShowNote(false)
    } catch { /* silent */ } finally { setActionPending(null) }
  }

  const totalPages = pagination?.totalPages ?? 1

  const statCards: Array<{ label: string; value: string; icon: React.ElementType; iconCls: string; bgCls: string; sub?: string }> = [
    { label: "Total Calls Today",   value: todayTotal     !== null ? String(todayTotal)     : "—", icon: Phone,          iconCls: "text-blue-600",   bgCls: "bg-blue-50 dark:bg-blue-950/30" },
    { label: "Successful Bookings", value: todayBooked    !== null ? String(todayBooked)    : "—", icon: CheckCircle2,   iconCls: "text-green-600",  bgCls: "bg-green-50 dark:bg-green-950/30",
      sub: todayTotal ? `${Math.round(((todayBooked ?? 0) / todayTotal) * 100)}% conversion` : undefined },
    { label: "Escalated to Staff",  value: todayEscalated !== null ? String(todayEscalated) : "—", icon: PhoneForwarded, iconCls: "text-orange-600", bgCls: "bg-orange-50 dark:bg-orange-950/30" },
    { label: "Avg Duration",        value: fmtAvgDuration(todayAvgSec),                             icon: Clock,          iconCls: "text-purple-600", bgCls: "bg-purple-50 dark:bg-purple-950/30" },
  ]

  return (
    <div className="pt-4 pb-8 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">Call Logs</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">Review all calls handled by the AI voice agent</p>
        </div>
        <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white h-9 md:h-10 text-sm self-start sm:self-auto">
          <Download className="h-4 w-4" />
          Export Logs
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {statCards.map(({ label, value, icon: Icon, iconCls, bgCls, sub }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{label}</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-2">{value}</p>
                  {sub && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{sub}</p>}
                </div>
                <div className={`${bgCls} p-3 rounded-lg`}>
                  <Icon className={`${iconCls} h-5 w-5`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by caller name, phone, or transcript content…"
            className="pl-10 h-10"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 flex-wrap">
          {/* Intent pills */}
          <div className="flex gap-0.5 border border-slate-200 dark:border-slate-700 rounded-lg p-1 bg-slate-50 dark:bg-slate-800 flex-shrink-0">
            {INTENT_FILTERS.map(v => (
              <button
                key={v}
                onClick={() => setFilterIntent(v)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  filterIntent === v
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white dark:hover:bg-slate-700"
                }`}
              >
                {v === "" ? "All Intents" : (INTENT_CFG[v]?.label ?? v)}
              </button>
            ))}
          </div>

          {/* Outcome pills */}
          <div className="flex gap-0.5 border border-slate-200 dark:border-slate-700 rounded-lg p-1 bg-slate-50 dark:bg-slate-800 flex-shrink-0">
            {OUTCOME_FILTERS.map(v => (
              <button
                key={v}
                onClick={() => setFilterOutcome(v)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  filterOutcome === v
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white dark:hover:bg-slate-700"
                }`}
              >
                {v === "" ? "All Outcomes" : (OUTCOME_CFG[v]?.label ?? v)}
              </button>
            ))}
          </div>

          {/* Date preset pills */}
          <div className="flex gap-0.5 border border-slate-200 dark:border-slate-700 rounded-lg p-1 bg-slate-50 dark:bg-slate-800 flex-shrink-0">
            {DATE_PRESETS.map(([v, label]) => (
              <button
                key={v}
                onClick={() => setDatePreset(v)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  datePreset === v
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white dark:hover:bg-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-4">Caller</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Intent</th>
                <th className="py-3 px-4">Outcome</th>
                <th className="py-3 px-4">Sentiment</th>
                <th className="py-3 px-4 text-right">Transcript</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 7 }).map((_, i) => <SkeletonRow key={i} />)
                : logs.length === 0
                ? (
                  <tr>
                    <td colSpan={7} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3 text-slate-400">
                        <Phone className="h-10 w-10 opacity-20" />
                        <p className="font-medium text-slate-500 dark:text-slate-400">No calls yet</p>
                        <p className="text-sm text-slate-400 dark:text-slate-500 max-w-xs">
                          Calls handled by the AI agent will appear here automatically.
                        </p>
                      </div>
                    </td>
                  </tr>
                )
                : logs.map(log => (
                  <tr
                    key={log.id}
                    className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="text-xs text-slate-500 dark:text-slate-400">{relativeTime(log.startTime)}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-xs font-semibold text-blue-700 dark:text-blue-300 flex-shrink-0">
                          {avatarInitials(log.callerName ?? "Unknown Caller")}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[180px] flex items-center gap-1">
                            {log.callerName ?? "Unknown Caller"}
                            {log.flagForFollowUp && <Flag className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                            {log.isReviewed     && <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{log.callerPhone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatDuration(log.duration)}
                    </td>
                    <td className="py-3 px-4">
                      <IntentBadge intent={log.intent} />
                    </td>
                    <td className="py-3 px-4">
                      <OutcomeBadge outcome={log.outcome} />
                    </td>
                    <td className="py-3 px-4">
                      {SENTIMENT_ICON[log.sentiment] ?? <Meh className="w-4 h-4 text-slate-400" />}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 text-xs gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                        onClick={() => openDialog(log)}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        View Transcript
                      </Button>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-slate-600 dark:text-slate-400 px-2">{currentPage} / {totalPages}</span>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Transcript dialog */}
      {selectedLog && (
        <TranscriptDialog
          log={selectedLog}
          dialogLoading={dialogLoading}
          actionPending={actionPending}
          showNote={showNote}
          noteText={noteText}
          onClose={closeDialog}
          onMarkReviewed={handleMarkReviewed}
          onToggleFlag={handleToggleFlag}
          onOpenNote={() => { setShowNote(true); setNoteText(selectedLog.summary ?? "") }}
          onNoteChange={setNoteText}
          onSaveNote={handleSaveNote}
          onCancelNote={() => setShowNote(false)}
        />
      )}
    </div>
  )
}
