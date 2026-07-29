"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  format, formatDistanceToNow, differenceInSeconds,
} from "date-fns"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  MessageSquare, Search, CheckCircle2, Download, ChevronLeft, ChevronRight,
  Calendar, HelpCircle, Clock, MapPin, Shield, Globe, Smartphone, Monitor,
  X, User, FileText, Loader2, Laptop, Tag, UserPlus, BookOpen, Briefcase,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatientRef {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  email: string | null
}

interface AppointmentRef {
  id: string
  startTime: string
  type: string
  status: string
  provider: string | null
}

interface ChatMessage {
  type: "bot" | "visitor" | "system"
  content: string
  timestamp: string
  senderName?: string
}

interface ApiChatLog {
  id: string
  sessionId: string
  visitorName: string | null
  visitorEmail: string | null
  visitorPhone: string | null
  startTime: string
  endTime: string | null
  messageCount: number
  topic: string
  outcome: string
  messages: ChatMessage[]
  summary: string | null
  sourcePage: string | null
  deviceType: string | null
  browser: string | null
  leadCaptured: boolean
  leadInfo: Record<string, unknown> | null
  appointmentBooked: boolean
  patientId: string | null
  isReviewed: boolean
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

function chatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return "—"
  try {
    const secs = differenceInSeconds(new Date(endIso), new Date(startIso))
    if (secs < 0) return "—"
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${String(s).padStart(2, "0")}`
  } catch {
    return "—"
  }
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

function visitorLabel(log: ApiChatLog): string {
  return log.visitorName ?? "Anonymous Visitor"
}

function avatarInitials(name: string): string {
  return name.split(" ").map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "?"
}

function sourcePageLabel(url: string | null): string {
  if (!url) return "—"
  try {
    const p = new URL(url).pathname
    return p === "/" ? "Homepage" : p.replace(/^\//, "")
  } catch {
    return url.replace(/^\//, "") || "Homepage"
  }
}

function deviceIcon(deviceType: string | null) {
  const t = (deviceType ?? "").toLowerCase()
  if (t.includes("mobile")) return <Smartphone className="h-3.5 w-3.5" />
  if (t.includes("tablet")) return <Laptop className="h-3.5 w-3.5" />
  return <Monitor className="h-3.5 w-3.5" />
}

// ─── Display config ───────────────────────────────────────────────────────────

const TOPIC_CFG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  APPOINTMENT: { label: "Appointment", icon: <Calendar className="h-3 w-3" />,     cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
  PRICING:     { label: "Pricing",     icon: <Tag className="h-3 w-3" />,           cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  INSURANCE:   { label: "Insurance",   icon: <Shield className="h-3 w-3" />,        cls: "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300" },
  HOURS:       { label: "Hours",       icon: <Clock className="h-3 w-3" />,         cls: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300" },
  SERVICES:    { label: "Services",    icon: <Briefcase className="h-3 w-3" />,     cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300" },
  LOCATION:    { label: "Location",    icon: <MapPin className="h-3 w-3" />,        cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" },
  OTHER:       { label: "General",     icon: <HelpCircle className="h-3 w-3" />,   cls: "bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400" },
}

const OUTCOME_CFG: Record<string, { label: string; cls: string }> = {
  IN_PROGRESS:      { label: "In Progress",   cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
  BOOKED:           { label: "Booked",         cls: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" },
  INFO_PROVIDED:    { label: "Info Only",      cls: "bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400" },
  ESCALATED_TO_CALL:{ label: "Escalated",      cls: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300" },
  LEAD_CAPTURED:    { label: "Lead Captured",  cls: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" },
  ABANDONED:        { label: "Abandoned",      cls: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
}

const TOPIC_FILTERS  = ["", "APPOINTMENT", "PRICING", "INSURANCE", "HOURS", "SERVICES", "LOCATION"]
const OUTCOME_FILTERS = ["", "BOOKED", "LEAD_CAPTURED", "INFO_PROVIDED", "ESCALATED_TO_CALL", "ABANDONED"]
const DATE_PRESETS: Array<[DatePreset, string]> = [
  ["", "All Time"], ["today", "Today"], ["week", "This Week"], ["month", "This Month"],
]

// ─── Micro-components ─────────────────────────────────────────────────────────

function TopicBadge({ topic }: { topic: string }) {
  const cfg = TOPIC_CFG[topic] ?? TOPIC_CFG.OTHER
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
      {[40, 180, 100, 40, 80, 80, 56, 110].map((w, i) => (
        <td key={i} className="py-3 px-4">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" style={{ width: w }} />
        </td>
      ))}
    </tr>
  )
}

// ─── Conversation dialog ──────────────────────────────────────────────────────

function ConversationDialog({
  log, dialogLoading, actionPending, showNote, noteText,
  onClose, onMarkReviewed, onOpenNote, onNoteChange, onSaveNote, onCancelNote,
}: {
  log: ApiChatLog
  dialogLoading: boolean
  actionPending: string | null
  showNote: boolean
  noteText: string
  onClose: () => void
  onMarkReviewed: () => void
  onOpenNote: () => void
  onNoteChange: (v: string) => void
  onSaveNote: () => void
  onCancelNote: () => void
}) {
  const messages: ChatMessage[] = Array.isArray(log.messages) ? log.messages : []

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center md:justify-center p-0 md:p-4">
      <div className="bg-white dark:bg-slate-900 w-full md:max-w-2xl md:rounded-2xl max-h-[92vh] md:max-h-[88vh] flex flex-col rounded-t-2xl overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-50">
              {visitorLabel(log)}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {format(new Date(log.startTime), "MMM d, yyyy h:mm a")}
              {log.sourcePage && ` · ${sourcePageLabel(log.sourcePage)}`}
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
              { label: "Topic",    content: <TopicBadge topic={log.topic} /> },
              { label: "Outcome",  content: <OutcomeBadge outcome={log.outcome} /> },
              { label: "Duration", content: <span className="font-mono text-sm font-medium text-slate-900 dark:text-slate-100">{chatDuration(log.startTime, log.endTime)}</span> },
              { label: "Messages", content: <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{log.messageCount}</span> },
            ].map(({ label, content }) => (
              <div key={label} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1.5">{label}</p>
                {content}
              </div>
            ))}
          </div>

          {/* Device / browser info */}
          {(log.deviceType || log.browser || log.sourcePage) && (
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              {log.sourcePage && (
                <span className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                  <Globe className="h-3 w-3" />
                  {sourcePageLabel(log.sourcePage)}
                </span>
              )}
              {log.deviceType && (
                <span className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                  {deviceIcon(log.deviceType)}
                  {log.deviceType}
                </span>
              )}
              {log.browser && (
                <span className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                  <BookOpen className="h-3 w-3" />
                  {log.browser}
                </span>
              )}
            </div>
          )}

          {/* Visitor contact info */}
          {(log.visitorEmail || log.visitorPhone) && (
            <div className="flex flex-wrap gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm">
              {log.visitorEmail && <span className="text-slate-600 dark:text-slate-400">{log.visitorEmail}</span>}
              {log.visitorPhone && <span className="text-slate-600 dark:text-slate-400">{log.visitorPhone}</span>}
            </div>
          )}

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

          {/* Create Patient Record — shown when lead captured but not yet linked to a patient */}
          {log.leadCaptured && !log.patient && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-violet-200 dark:border-violet-800/50 bg-violet-50 dark:bg-violet-950/20">
              <Tag className="h-4 w-4 text-violet-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-violet-800 dark:text-violet-300">Lead Captured</p>
                <p className="text-xs text-violet-600 dark:text-violet-400">Visitor provided contact info but has no patient record yet.</p>
              </div>
              <Link
                href={`/patients?action=new${log.visitorName ? `&name=${encodeURIComponent(log.visitorName)}` : ""}${log.visitorEmail ? `&email=${encodeURIComponent(log.visitorEmail)}` : ""}${log.visitorPhone ? `&phone=${encodeURIComponent(log.visitorPhone)}` : ""}`}
              >
                <Button size="sm" className="gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white flex-shrink-0">
                  <UserPlus className="h-3.5 w-3.5" />
                  Create Patient Record
                </Button>
              </Link>
            </div>
          )}

          {/* Lead info object */}
          {log.leadInfo && Object.keys(log.leadInfo).length > 0 && (
            <div className="bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800/50 rounded-lg p-4">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wider mb-3">Lead Information</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                {Object.entries(log.leadInfo).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-slate-500 capitalize">{k.replace(/_/g, " ")}</dt>
                    <dd className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* AI summary */}
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
                  {actionPending === "note" && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                  Save Note
                </Button>
              </div>
            </div>
          )}

          {/* Conversation */}
          <div>
            <h4 className="font-semibold text-slate-900 dark:text-slate-50 mb-3 text-sm">Conversation</h4>
            {dialogLoading ? (
              <div className="space-y-3">
                {[160, 220, 140, 200, 120].map((w, i) => (
                  <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                    <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse" style={{ width: w }} />
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No messages captured for this conversation.</p>
            ) : (
              <div className="space-y-2.5">
                {messages.map((msg, i) => {
                  if (msg.type === "system") {
                    return (
                      <div key={i} className="text-center">
                        <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                          {msg.content}
                        </span>
                      </div>
                    )
                  }
                  const isBot = msg.type === "bot"
                  return (
                    <div key={i} className={`flex ${isBot ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[80%] px-4 py-2.5 rounded-xl text-sm ${
                        isBot
                          ? "bg-blue-100 dark:bg-blue-900/40 text-slate-800 dark:text-slate-200 rounded-bl-none"
                          : "bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-br-none"
                      }`}>
                        {isBot && <p className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-1">Chatbot</p>}
                        {!isBot && msg.senderName && <p className="text-xs font-semibold text-slate-500 mb-1">{msg.senderName}</p>}
                        <p>{msg.content}</p>
                        {msg.timestamp && <p className="text-xs text-slate-400 mt-1">{msg.timestamp}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
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
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChatLogsPage() {
  const [logs,        setLogs]        = useState<ApiChatLog[]>([])
  const [loading,     setLoading]     = useState(true)
  const [pagination,  setPagination]  = useState<Pagination | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  const [search,          setSearch]          = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [filterTopic,     setFilterTopic]     = useState("")
  const [filterOutcome,   setFilterOutcome]   = useState("")
  const [datePreset,      setDatePreset]      = useState<DatePreset>("")

  // Today stats
  const [todayTotal,   setTodayTotal]   = useState<number | null>(null)
  const [todayBooked,  setTodayBooked]  = useState<number | null>(null)
  const [todayLeads,   setTodayLeads]   = useState<number | null>(null)
  const [todayAvgMsgs, setTodayAvgMsgs] = useState<number | null>(null)

  // Dialog
  const [selectedLog,   setSelectedLog]   = useState<ApiChatLog | null>(null)
  const [dialogLoading, setDialogLoading] = useState(false)
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [showNote,      setShowNote]      = useState(false)
  const [noteText,      setNoteText]      = useState("")

  // Debounce 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Reset page on filter change
  useEffect(() => { setCurrentPage(1) }, [debouncedSearch, filterTopic, filterOutcome, datePreset])

  // Fetch list
  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(currentPage), limit: "20" })
      if (debouncedSearch) p.set("search",  debouncedSearch)
      if (filterTopic)     p.set("topic",   filterTopic)
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
      const res  = await fetch(`/api/chat-logs?${p}`)
      const json = await res.json()
      setLogs(json.data ?? [])
      setPagination(json.pagination ?? null)
    } finally {
      setLoading(false)
    }
  }, [currentPage, debouncedSearch, filterTopic, filterOutcome, datePreset])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  // Today stats
  useEffect(() => {
    const now = new Date()
    const p = new URLSearchParams({
      dateFrom: startOfDay(now).toISOString(),
      dateTo:   endOfDay(now).toISOString(),
      limit:    "500",
    })
    fetch(`/api/chat-logs?${p}`)
      .then(r => r.json())
      .then(json => {
        const data: ApiChatLog[] = json.data ?? []
        const total = (json.pagination?.total as number) ?? data.length
        setTodayTotal(total)
        setTodayBooked(data.filter(l => l.outcome === "BOOKED").length)
        setTodayLeads(data.filter(l => l.leadCaptured).length)
        setTodayAvgMsgs(
          data.length ? Math.round(data.reduce((s, l) => s + l.messageCount, 0) / data.length) : null
        )
      })
      .catch(() => {})
  }, [])

  // Open dialog — show partial data immediately, fetch full for messages
  async function openDialog(log: ApiChatLog) {
    setSelectedLog(log)
    setShowNote(false)
    setNoteText(log.summary ?? "")
    setDialogLoading(true)
    try {
      const res  = await fetch(`/api/chat-logs/${log.id}`)
      const full = await res.json()
      setSelectedLog(full)
    } catch { /* keep partial */ } finally {
      setDialogLoading(false)
    }
  }

  function closeDialog() {
    setSelectedLog(null)
    setShowNote(false)
    setNoteText("")
  }

  async function patch(id: string, body: Record<string, unknown>): Promise<ApiChatLog> {
    const res = await fetch(`/api/chat-logs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error("Update failed")
    return res.json()
  }

  function applyUpdate(updated: ApiChatLog) {
    setSelectedLog(updated)
    setLogs(prev => prev.map(l => l.id === updated.id ? updated : l))
  }

  async function handleMarkReviewed() {
    if (!selectedLog || selectedLog.isReviewed) return
    setActionPending("review")
    try { applyUpdate(await patch(selectedLog.id, { isReviewed: true })) }
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
    { label: "Total Chats Today",   value: todayTotal   !== null ? String(todayTotal)   : "—", icon: MessageSquare, iconCls: "text-blue-600",   bgCls: "bg-blue-50 dark:bg-blue-950/30" },
    { label: "Appointments Booked", value: todayBooked  !== null ? String(todayBooked)  : "—", icon: CheckCircle2,  iconCls: "text-green-600",  bgCls: "bg-green-50 dark:bg-green-950/30",
      sub: todayTotal ? `${Math.round(((todayBooked ?? 0) / todayTotal) * 100)}% conversion` : undefined },
    { label: "Leads Captured",      value: todayLeads   !== null ? String(todayLeads)   : "—", icon: UserPlus,      iconCls: "text-violet-600", bgCls: "bg-violet-50 dark:bg-violet-950/30" },
    { label: "Avg Messages",        value: todayAvgMsgs !== null ? String(todayAvgMsgs) : "—", icon: FileText,      iconCls: "text-purple-600", bgCls: "bg-purple-50 dark:bg-purple-950/30" },
  ]

  return (
    <div className="pt-4 pb-8 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">Chat Logs</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">Review conversations captured from the website chatbot</p>
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
            placeholder="Search by visitor name or email…"
            className="pl-10 h-10"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 flex-wrap">
          {/* Topic pills */}
          <div className="flex gap-0.5 border border-slate-200 dark:border-slate-700 rounded-lg p-1 bg-slate-50 dark:bg-slate-800 flex-shrink-0">
            {TOPIC_FILTERS.map(v => (
              <button
                key={v}
                onClick={() => setFilterTopic(v)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  filterTopic === v
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white dark:hover:bg-slate-700"
                }`}
              >
                {v === "" ? "All Topics" : (TOPIC_CFG[v]?.label ?? v)}
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

          {/* Date presets */}
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
                <th className="py-3 px-4">Visitor</th>
                <th className="py-3 px-4">Source Page</th>
                <th className="py-3 px-4">Messages</th>
                <th className="py-3 px-4">Topic</th>
                <th className="py-3 px-4">Outcome</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4 text-right">Conversation</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 7 }).map((_, i) => <SkeletonRow key={i} />)
                : logs.length === 0
                ? (
                  <tr>
                    <td colSpan={8} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3 text-slate-400">
                        <MessageSquare className="h-10 w-10 opacity-20" />
                        <p className="font-medium text-slate-500 dark:text-slate-400">No chat conversations yet</p>
                        <p className="text-sm text-slate-400 dark:text-slate-500 max-w-xs">
                          Chatbot conversations will appear here automatically.
                        </p>
                      </div>
                    </td>
                  </tr>
                )
                : logs.map(log => {
                  const isAnon = !log.visitorName
                  return (
                    <tr
                      key={log.id}
                      className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="text-xs text-slate-500 dark:text-slate-400">{relativeTime(log.startTime)}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                            isAnon
                              ? "bg-slate-100 dark:bg-slate-700 text-slate-500"
                              : "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
                          }`}>
                            {isAnon ? <User className="h-3.5 w-3.5" /> : avatarInitials(log.visitorName!)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[160px] flex items-center gap-1">
                              {visitorLabel(log)}
                              {log.leadCaptured && !log.patient && (
                                <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 ml-1">Lead</span>
                              )}
                              {log.isReviewed && <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />}
                            </p>
                            {log.visitorEmail && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[160px]">{log.visitorEmail}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {log.sourcePage ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400">
                            <Globe className="h-3 w-3" />
                            {sourcePageLabel(log.sourcePage)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400 text-sm font-medium">
                        {log.messageCount}
                      </td>
                      <td className="py-3 px-4">
                        <TopicBadge topic={log.topic} />
                      </td>
                      <td className="py-3 px-4">
                        <OutcomeBadge outcome={log.outcome} />
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {chatDuration(log.startTime, log.endTime)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 text-xs gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                          onClick={() => openDialog(log)}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          View
                        </Button>
                      </td>
                    </tr>
                  )
                })
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

      {/* Conversation dialog */}
      {selectedLog && (
        <ConversationDialog
          log={selectedLog}
          dialogLoading={dialogLoading}
          actionPending={actionPending}
          showNote={showNote}
          noteText={noteText}
          onClose={closeDialog}
          onMarkReviewed={handleMarkReviewed}
          onOpenNote={() => { setShowNote(true); setNoteText(selectedLog.summary ?? "") }}
          onNoteChange={setNoteText}
          onSaveNote={handleSaveNote}
          onCancelNote={() => setShowNote(false)}
        />
      )}
    </div>
  )
}
