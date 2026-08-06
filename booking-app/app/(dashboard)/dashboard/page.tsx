"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Phone,
  Calendar,
  TrendingUp,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  MessageSquare,
  RefreshCw,
  Inbox,
  Timer,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecentCall {
  id: string;
  callerName: string | null;
  callerPhone: string;
  startTime: string;
  duration: number | null;
  outcome: string;
  wasEscalated: boolean;
  patient: { firstName: string; lastName: string } | null;
}

interface ScheduleItem {
  id: string;
  startTime: string;
  type: string;
  status: string;
  patient: { firstName: string; lastName: string } | null;
  title?: string | null;
  source?: "crm" | "gcal";
}

interface DashboardData {
  practiceName: string;
  user: { firstName: string; lastName: string; role: string } | null;
  stats: {
    callsToday: number;
    callsYesterday: number;
    appointmentsToday: number;
    appointmentsBookedToday: number;
    appointmentsYesterday: number;
    activePatients: number;
    newPatientsThisWeek: number;
    noShowRate: number;
    chatbotsToday: number;
    avgCallDurationSeconds: number;
    escalatedToday: number;
    messagesToday: number;
    openConversations: number;
    avgFirstResponseMinutes: number | null;
  };
  recentCalls: RecentCall[];
  todaySchedule: ScheduleItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function greeting(firstName: string | null | undefined) {
  const h = new Date().getHours();
  const salutation =
    h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return firstName ? `${salutation}, ${firstName}` : salutation;
}

function formatCallDuration(seconds: number) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hr${diffHours > 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
}

function formatAppointmentTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatAppointmentType(type: string) {
  return type
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function callOutcomeStyle(outcome: string, wasEscalated: boolean) {
  if (wasEscalated || outcome === "TRANSFERRED")
    return "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-700/60";
  if (outcome === "BOOKED")
    return "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-700/60";
  return "bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 border-slate-200/60 dark:border-slate-600/60";
}

function callOutcomeLabel(outcome: string, wasEscalated: boolean) {
  if (wasEscalated) return "Escalated";
  const map: Record<string, string> = {
    BOOKED: "Booked",
    INFO_PROVIDED: "Info Only",
    TRANSFERRED: "Transferred",
    HUNG_UP: "Hung Up",
    VOICEMAIL: "Voicemail",
    IN_PROGRESS: "In Progress",
  };
  return map[outcome] ?? outcome;
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastUpdated(new Date());
      }
    } catch (e) {
      console.error("Failed to load dashboard", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    // Refresh every 60 seconds
    const interval = setInterval(fetchDashboard, 60_000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const s = data?.stats;

  const callDelta = s ? percentChange(s.callsToday, s.callsYesterday) : 0;
  const aptDelta  = s ? percentChange(s.appointmentsBookedToday, s.appointmentsYesterday) : 0;

  const updatedText = lastUpdated
    ? `Updated ${formatRelativeTime(lastUpdated.toISOString())}`
    : "Loading…";

  return (
    <div className="pt-4 pb-8 space-y-6 md:space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          {loading ? (
            <>
              <div className="h-8 w-64 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
              <div className="h-4 w-48 bg-slate-100 dark:bg-slate-800 rounded mt-2 animate-pulse" />
            </>
          ) : (
            <>
              <h1 className="text-xl md:text-2xl lg:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                {greeting(data?.user?.firstName)}
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
                {data?.practiceName
                  ? `Here's your ${data.practiceName} summary for today`
                  : "Here's a summary of your practice today"}
              </p>
            </>
          )}
        </div>
        <button
          onClick={fetchDashboard}
          className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg self-start sm:self-auto whitespace-nowrap flex-shrink-0 transition-colors"
        >
          <Clock className="h-3.5 w-3.5" />
          <span>{updatedText}</span>
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 md:p-6 shadow-sm animate-pulse h-32" />
          ))
        ) : (
          <>
            {/* Total Calls Today */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">Total Calls Today</p>
                  <p className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1 md:mt-2">
                    {s?.callsToday ?? 0}
                  </p>
                </div>
                <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 rounded-lg">
                  <Phone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <div className="flex items-center gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                {callDelta >= 0 ? (
                  <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
                )}
                <span className={`text-xs font-medium ${callDelta >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {callDelta >= 0 ? "+" : ""}{callDelta}%
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">vs yesterday</span>
              </div>
            </div>

            {/* Appointments Booked */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3 md:mb-4">
                <div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">Appointments Today</p>
                  <p className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1 md:mt-2">
                    {s?.appointmentsToday ?? 0}
                  </p>
                </div>
                <div className="p-2.5 bg-green-50 dark:bg-green-950/40 rounded-lg">
                  <Calendar className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div className="flex items-center gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                {aptDelta >= 0 ? (
                  <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
                )}
                <span className={`text-xs font-medium ${aptDelta >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {s?.appointmentsBookedToday ?? 0} booked today
                </span>
              </div>
            </div>

            {/* Active Patients */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3 md:mb-4">
                <div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">Active Patients</p>
                  <p className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1 md:mt-2">
                    {s?.activePatients?.toLocaleString() ?? 0}
                  </p>
                </div>
                <div className="p-2.5 bg-purple-50 dark:bg-purple-950/40 rounded-lg">
                  <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
              <div className="flex items-center gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  +{s?.newPatientsThisWeek ?? 0} this week
                </span>
              </div>
            </div>

            {/* No-Show Rate */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3 md:mb-4">
                <div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">No-Show Rate</p>
                  <p className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1 md:mt-2">
                    {s?.noShowRate ?? 0}%
                  </p>
                </div>
                <div className="p-2.5 bg-orange-50 dark:bg-orange-950/40 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
              </div>
              <div className="flex items-center gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-500 dark:text-slate-400">Last 30 days</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Patient Messaging KPIs */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Patient Messaging</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 md:p-6 shadow-sm animate-pulse h-28" />
            ))
          ) : (
            <>
              <Link
                href="/messaging"
                className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow block"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">Messages Today</p>
                    <p className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1">
                      {s?.messagesToday ?? 0}
                    </p>
                  </div>
                  <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg">
                    <MessageSquare className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                </div>
              </Link>

              <Link
                href="/messaging"
                className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow block"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">Open Conversations</p>
                    <p className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1">
                      {s?.openConversations ?? 0}
                    </p>
                  </div>
                  <div className="p-2.5 bg-sky-50 dark:bg-sky-950/40 rounded-lg">
                    <Inbox className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                  </div>
                </div>
              </Link>

              <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 md:p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">Avg First Response</p>
                    <p className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1">
                      {s?.avgFirstResponseMinutes != null ? `${s.avgFirstResponseMinutes}m` : '—'}
                    </p>
                  </div>
                  <div className="p-2.5 bg-teal-50 dark:bg-teal-950/40 rounded-lg">
                    <Timer className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  Across recent conversations with patient messages
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Recent Calls + Today's Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className={`bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-6 animate-pulse h-72 ${i === 0 ? "lg:col-span-2" : ""}`}
            />
          ))
        ) : (
          <>
            {/* Recent Calls – 2 columns */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm hover:shadow-md transition-shadow">
              <div className="border-b border-slate-200 dark:border-slate-700 px-4 md:px-6 py-4 md:py-5">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Recent Calls</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                  Latest interactions handled by the AI voice agent
                </p>
              </div>
              <div className="p-3 md:p-6">
                {data?.recentCalls.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
                    No calls recorded yet.
                  </p>
                ) : (
                  <div className="space-y-1 md:space-y-3">
                    {data?.recentCalls.map((call) => {
                      const name =
                        call.patient
                          ? `${call.patient.firstName} ${call.patient.lastName}`
                          : call.callerName ?? "Unknown Caller";
                      return (
                        <div
                          key={call.id}
                          className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center flex-shrink-0">
                              <Phone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {formatRelativeTime(call.startTime)}
                                {call.duration ? ` · ${formatCallDuration(call.duration)}` : ""}
                              </p>
                            </div>
                          </div>
                          <div
                            className={`text-xs font-medium px-2.5 py-0.5 rounded-md border ${callOutcomeStyle(call.outcome, call.wasEscalated)}`}
                          >
                            {callOutcomeLabel(call.outcome, call.wasEscalated)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Today's Schedule – 1 column */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm hover:shadow-md transition-shadow">
              <div className="border-b border-slate-200 dark:border-slate-700 px-4 md:px-6 py-4 md:py-5">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Today's Schedule</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">Upcoming appointments</p>
              </div>
              <div className="p-3 md:p-6">
                {data?.todaySchedule.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
                    No appointments scheduled for today.
                  </p>
                ) : (
                  <div className="space-y-1 md:space-y-3">
                    {data?.todaySchedule.map((apt) => (
                      <div
                        key={apt.id}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                      >
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-md whitespace-nowrap flex-shrink-0">
                          {formatAppointmentTime(apt.startTime)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {apt.patient
                              ? `${apt.patient.firstName} ${apt.patient.lastName}`
                              : apt.title ?? "Unknown Patient"}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {formatAppointmentType(apt.type)}
                            {apt.source === "gcal" && " · Google Calendar"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 md:p-6 shadow-sm animate-pulse h-24" />
          ))
        ) : (
          <>
            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg flex-shrink-0">
                  <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Chatbot Conversations
                  </p>
                  <p className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-slate-50 mt-1">
                    {s?.chatbotsToday ?? 0}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">today</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg flex-shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Avg Call Duration
                  </p>
                  <p className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-slate-50 mt-1">
                    {s?.avgCallDurationSeconds
                      ? `${Math.floor(s.avgCallDurationSeconds / 60)}:${String(s.avgCallDurationSeconds % 60).padStart(2, "0")}`
                      : "—"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">per call today</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="p-3 bg-orange-50 dark:bg-orange-950/40 rounded-lg flex-shrink-0">
                  <XCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Escalated to Staff
                  </p>
                  <p className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-slate-50 mt-1">
                    {s?.escalatedToday ?? 0}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">today</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
