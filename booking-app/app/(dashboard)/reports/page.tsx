'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  Download,
  Calendar,
  Users,
  Phone,
  Clock,
  AlertCircle,
  Target,
  Loader2,
  MessageSquare,
} from 'lucide-react';

// ── Appointment analytics (real data from /api/reports/overview) ─────────────

const TYPE_COLORS: Record<string, string> = {
  'Evaluation':   '#3b82f6',
  'Hygiene':      '#22c55e',
  'Restorative':  '#f59e0b',
  'Endodontics':  '#f43f5e',
  'Implant':      '#6366f1',
  'Orthodontics': '#d946ef',
  'Aesthetics':   '#14b8a6',
  'Surgery':      '#ef4444',
  'Emergency':    '#f97316',
  'Follow-up':    '#a855f7',
  'Consultation': '#06b6d4',
  'Procedure':    '#64748b',
  'Other':        '#38bdf8',
};

const OUTCOME_COLORS: Record<string, string> = {
  'Booked':      '#10b981',
  'Transferred': '#f97316',
  'Info Only':   '#3b82f6',
  'Hung Up':     '#9ca3af',
  'Voicemail':   '#8b5cf6',
  'In Progress': '#64748b',
};

interface OverviewData {
  rangeDays: number;
  kpis: {
    totalAppointments: number;
    noShowCount: number;
    noShowRate: number;
    totalCalls: number;
    escalatedCalls: number;
    avgCallDurationSeconds: number;
    activePatients: number;
    newPatients: number;
    messagesSent: number;
  };
  apptsOverTime: Array<{ label: string; appts: number; noShows: number }>;
  callsOverTime: Array<{ label: string; calls: number; escalated: number }>;
  apptTypes: Array<{ name: string; value: number }>;
  peakHours: Array<{ hour: string; count: number }>;
  callOutcomes: Array<{ name: string; value: number }>;
  engagement: { calls: number; sms: number; emails: number };
}

const PERIOD_TABS = [
  { label: 'Today',        days: 1 },
  { label: 'Last 7 Days',  days: 7 },
  { label: 'Last 30 Days', days: 30 },
  { label: 'Last Quarter', days: 90 },
  { label: 'Last Year',    days: 365 },
];

const card = "bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm";
const cardHeader = "px-4 md:px-6 py-4 md:py-5 border-b border-slate-200 dark:border-slate-700";
const cardTitle = "text-base font-semibold text-slate-900 dark:text-slate-50";

interface KpiCardProps {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
}

function KPICard({ kpi }: { kpi: KpiCardProps }) {
  const Icon = kpi.icon;
  return (
    <div className={`${card} p-4 md:p-6`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{kpi.label}</p>
          <p className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1.5">{kpi.value}</p>
        </div>
        <div className={`p-2.5 rounded-lg flex-shrink-0 ${kpi.iconBg}`}>
          <Icon className={`w-5 h-5 ${kpi.iconColor}`} />
        </div>
      </div>
      <div className="flex items-center gap-1 pt-3 border-t border-slate-100 dark:border-slate-800">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.sub}</span>
      </div>
    </div>
  );
}

export default function ReportsAnalyticsPage() {
  const [periodDays, setPeriodDays] = useState(30);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [overviewError, setOverviewError] = useState("");
  const fetchOverview = useCallback(async (days: number) => {
    setLoading(true);
    setOverviewError("");
    try {
      const res = await fetch(`/api/reports/overview?days=${days}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: OverviewData = await res.json();
      setOverview(data);
    } catch (e) {
      console.error("Failed to load report overview", e);
      setOverviewError("Failed to load report data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOverview(periodDays); }, [periodDays, fetchOverview]);

  return (
    <div className="pt-4 pb-8 space-y-6 md:space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">Reports & Analytics</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Track performance metrics and operational insights</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <Button
            className="gap-2 bg-blue-600 hover:bg-blue-700 h-9 text-sm"
            onClick={() => window.print()}
          >
            <Download className="w-4 h-4" />
            Export / Print
          </Button>
        </div>
      </div>

      {/* Time Period Tabs */}
      <div className="flex gap-0 border-b border-slate-200 dark:border-slate-700 overflow-x-auto items-center">
        {PERIOD_TABS.map((tab) => (
          <button
            key={tab.days}
            onClick={() => setPeriodDays(tab.days)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              periodDays === tab.days
                ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
        {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400 ml-2" />}
      </div>

      {overviewError && (
        <div className={`${card} border-red-200 dark:border-red-800 p-4 flex items-center gap-3`}>
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 dark:text-red-400">{overviewError}</p>
          <button onClick={() => fetchOverview(periodDays)} className="ml-auto text-sm underline text-red-600 dark:text-red-400">Retry</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && !overview ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`${card} p-6 animate-pulse h-32`} />
          ))
        ) : overview ? (
          [
            {
              label: 'Appointments',
              value: overview.kpis.totalAppointments.toLocaleString(),
              sub: 'booked in the CRM agenda',
              icon: Calendar,
              iconColor: 'text-green-600 dark:text-green-400',
              iconBg: 'bg-green-50 dark:bg-green-950/40',
            },
            {
              label: 'No-Show / Cancelled',
              value: `${overview.kpis.noShowRate}%`,
              sub: `${overview.kpis.noShowCount} of ${overview.kpis.totalAppointments} appointments`,
              icon: AlertCircle,
              iconColor: 'text-orange-600 dark:text-orange-400',
              iconBg: 'bg-orange-50 dark:bg-orange-950/40',
            },
            {
              label: 'Total Calls',
              value: overview.kpis.totalCalls.toLocaleString(),
              sub: `${overview.kpis.escalatedCalls} escalated to staff`,
              icon: Phone,
              iconColor: 'text-blue-600 dark:text-blue-400',
              iconBg: 'bg-blue-50 dark:bg-blue-950/40',
            },
            {
              label: 'Active Patients',
              value: overview.kpis.activePatients.toLocaleString(),
              sub: `+${overview.kpis.newPatients} new in this period`,
              icon: Users,
              iconColor: 'text-purple-600 dark:text-purple-400',
              iconBg: 'bg-purple-50 dark:bg-purple-950/40',
            },
            {
              label: 'Messages Sent',
              value: overview.kpis.messagesSent.toLocaleString(),
              sub: 'confirmations and reminders (SMS + email)',
              icon: MessageSquare,
              iconColor: 'text-teal-600 dark:text-teal-400',
              iconBg: 'bg-teal-50 dark:bg-teal-950/40',
            },
            {
              label: 'Avg Call Duration',
              value: overview.kpis.avgCallDurationSeconds
                ? `${Math.floor(overview.kpis.avgCallDurationSeconds / 60)}:${String(overview.kpis.avgCallDurationSeconds % 60).padStart(2, '0')}`
                : '—',
              sub: 'minutes per call',
              icon: Clock,
              iconColor: 'text-slate-600 dark:text-slate-400',
              iconBg: 'bg-slate-100 dark:bg-slate-800',
            },
          ].map((kpi) => <KPICard key={kpi.label} kpi={kpi} />)
        ) : null}
      </div>

      {/* Charts Grid */}
      {overview && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Appointments Over Time */}
        <div className={card}>
          <div className={cardHeader}><h2 className={cardTitle}>Appointments Over Time</h2></div>
          <div className="p-4 md:p-6">
            {overview.kpis.totalAppointments === 0 ? (
              <div className="flex items-center justify-center h-[280px] text-slate-400 dark:text-slate-500 text-sm">
                No appointments in this period
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={overview.apptsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    interval={overview.apptsOverTime.length > 14 ? Math.floor(overview.apptsOverTime.length / 10) : 0}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="appts" stroke="#3b82f6" strokeWidth={2} dot={false} name="Appointments" />
                  <Line type="monotone" dataKey="noShows" stroke="#f97316" strokeWidth={2} dot={false} name="No-shows" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Appointment Types */}
        <div className={card}>
          <div className={cardHeader}><h2 className={cardTitle}>Appointments by Visit Type</h2></div>
          <div className="p-4 md:p-6">
            {overview.apptTypes.length === 0 ? (
              <div className="flex items-center justify-center h-[280px] text-slate-400 dark:text-slate-500 text-sm">
                No appointments in this period
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={overview.apptTypes} layout="vertical" margin={{ top: 5, right: 30, left: 120 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {overview.apptTypes.map((entry) => (
                      <Cell key={entry.name} fill={TYPE_COLORS[entry.name] ?? '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Peak Appointment Hours */}
        <div className={card}>
          <div className={cardHeader}><h2 className={cardTitle}>Peak Appointment Hours</h2></div>
          <div className="p-4 md:p-6">
            {overview.kpis.totalAppointments === 0 ? (
              <div className="flex items-center justify-center h-[280px] text-slate-400 dark:text-slate-500 text-sm">
                No appointments in this period
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={overview.peakHours}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="Appointments" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Call Outcomes */}
        <div className={card}>
          <div className={cardHeader}><h2 className={cardTitle}>Call Outcomes</h2></div>
          <div className="p-4 md:p-6">
            {overview.callOutcomes.length === 0 ? (
              <div className="flex items-center justify-center h-[280px] text-slate-400 dark:text-slate-500 text-sm">
                No calls recorded in this period
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={overview.callOutcomes} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                    {overview.callOutcomes.map((entry) => (
                      <Cell key={entry.name} fill={OUTCOME_COLORS[entry.name] ?? '#64748b'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Top Insights — computed from real data */}
      {overview && overview.kpis.totalAppointments > 0 && (() => {
        const busiest = overview.apptsOverTime.reduce(
          (best, b) => (b.appts > best.appts ? b : best),
          overview.apptsOverTime[0],
        );
        const peak = overview.peakHours.reduce(
          (best, h) => (h.count > best.count ? h : best),
          overview.peakHours[0],
        );
        const topType = overview.apptTypes[0];
        const insights = [
          {
            icon: Calendar,
            iconColor: 'text-blue-600 dark:text-blue-400',
            title: 'Busiest Day',
            description: `${busiest.label} had the most appointments (${busiest.appts}) in this period`,
          },
          {
            icon: Clock,
            iconColor: 'text-orange-600 dark:text-orange-400',
            title: 'Peak Hour',
            description: `Most appointments start around ${peak.hour} (${peak.count} appointments)`,
          },
          topType && {
            icon: Target,
            iconColor: 'text-green-600 dark:text-green-400',
            title: 'Top Visit Type',
            description: `${topType.name} is the most common visit (${topType.value} appointments)`,
          },
          {
            icon: AlertCircle,
            iconColor: overview.kpis.noShowRate > 10 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
            title: 'No-Show Rate',
            description: `${overview.kpis.noShowRate}% of appointments were no-shows or cancellations`,
          },
          {
            icon: TrendingUp,
            iconColor: 'text-purple-600 dark:text-purple-400',
            title: 'Daily Average',
            description: `About ${Math.round(overview.kpis.totalAppointments / Math.max(overview.rangeDays, 1) * 10) / 10} appointments per day`,
          },
        ].filter(Boolean) as Array<{ icon: React.ElementType; iconColor: string; title: string; description: string }>;
        return (
          <div className={card}>
            <div className={cardHeader}><h2 className={cardTitle}>Top Insights</h2></div>
            <div className="p-4 md:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {insights.map((insight) => {
                  const Icon = insight.icon;
                  return (
                    <div key={insight.title} className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40">
                      <div className="mb-2">
                        <Icon className={`w-5 h-5 ${insight.iconColor}`} />
                      </div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm mb-1">{insight.title}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{insight.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Patient Engagement by Channel — real counts */}
      {overview && (
        <div className={card}>
          <div className={cardHeader}><h2 className={cardTitle}>Patient Engagement by Channel</h2></div>
          <div className="p-4 md:p-6 space-y-4">
            {(() => {
              const channels = [
                { name: 'Phone Calls',      value: overview.engagement.calls },
                { name: 'SMS Sent',         value: overview.engagement.sms },
                { name: 'Emails Sent',      value: overview.engagement.emails },
              ];
              const max = Math.max(...channels.map((c) => c.value), 1);
              return channels.map((channel) => (
                <div key={channel.name}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{channel.name}</span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{channel.value.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full"
                      style={{ width: `${(channel.value / max) * 100}%` }}
                    />
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
