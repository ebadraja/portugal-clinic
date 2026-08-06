'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  TrendingDown,
  Download,
  Calendar,
  Users,
  Phone,
  Activity,
  Clock,
  AlertCircle,
  Target,
  Loader2,
  Mail,
  MailOpen,
  MousePointerClick,
  Zap,
  TriangleAlert,
} from 'lucide-react';

// ── Appointment analytics (real data from /api/reports/overview) ─────────────

const TYPE_COLORS: Record<string, string> = {
  'Well Visit':        '#3b82f6',
  'Sick Visit':        '#22c55e',
  'Behavioral Health': '#d946ef',
  'New Patient':       '#14b8a6',
  'Nurse Visit':       '#f97316',
  'Virtual':           '#6366f1',
  'Vaccination':       '#a855f7',
  'Follow-up':         '#f59e0b',
  'Consultation':      '#06b6d4',
  'Procedure':         '#f43f5e',
  'Other':             '#38bdf8',
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
  gcalConnected: boolean;
  kpis: {
    totalAppointments: number;
    noShowCount: number;
    noShowRate: number;
    totalCalls: number;
    escalatedCalls: number;
    avgCallDurationSeconds: number;
    activePatients: number;
    newPatients: number;
    chatSessions: number;
    emailsSent: number;
  };
  apptsOverTime: Array<{ label: string; appts: number; noShows: number }>;
  callsOverTime: Array<{ label: string; calls: number; escalated: number }>;
  apptTypes: Array<{ name: string; value: number }>;
  peakHours: Array<{ hour: string; count: number }>;
  callOutcomes: Array<{ name: string; value: number }>;
  engagement: { calls: number; chats: number; emails: number };
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
const tableHeaderRow = "border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60";
const tableHeaderCell = "text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider";
const tableRow = "border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors";

// ── Email analytics types ─────────────────────────────────────────────────────

interface EmailKpis {
  totalSent: number;
  totalSentChange: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

interface EmailDayStat {
  date: string;
  sent: number;
  opened: number;
  clicked: number;
}

interface EmailTemplate {
  name: string;
  sent: number;
  openRate: number;
  clickRate: number;
}

interface AutomationRule {
  id: string;
  name: string;
  triggerEvent: string;
  isActive: boolean;
  fires: number;
}

interface EmailCampaignRow {
  id: string;
  name: string;
  status: string;
  sentDate: string | null;
  recipients: number;
  openRate: number;
  clickRate: number;
}

interface EmailOverviewData {
  kpis: EmailKpis;
  dailyStats: EmailDayStat[];
  topTemplates: EmailTemplate[];
  automationActivity: AutomationRule[];
  campaigns: EmailCampaignRow[];
}

interface MetricsData {
  summary: {
    totalForms: number;
    totalReceived: number;
    statusBreakdown: Record<string, number>;
    averageMatchConfidence: number;
    matchRateOver85: number;
    averageProcessingTimeMinutes: number;
  };
  trends: {
    submissionTrend: Array<{ date: string; count: number }>;
    formTypeBreakdown: Array<{ title: string; count: number }>;
    confidenceDistribution: Record<string, number>;
  };
  reference: {
    uniqueFormTypes: string[];
  };
}

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
  const router = useRouter();
  const [periodDays, setPeriodDays] = useState(30);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [overviewError, setOverviewError] = useState("");
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState("");

  // Email Analytics state
  const [emailRange, setEmailRange] = useState('30d');
  const [emailData, setEmailData] = useState<EmailOverviewData | null>(null);
  const [emailLoading, setEmailLoading] = useState(true);
  const [emailError, setEmailError] = useState('');

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

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setMetricsLoading(true);
        const response = await fetch("/api/metrics/intake-forms");
        if (!response.ok) {
          throw new Error("Failed to fetch metrics");
        }
        const data = await response.json();
        setMetrics(data);
      } catch (error) {
        console.error("Error fetching metrics:", error);
        setMetricsError("Failed to load metrics");
      } finally {
        setMetricsLoading(false);
      }
    };

    fetchMetrics();
  }, []);

  const fetchEmailAnalytics = useCallback(async (range: string) => {
    setEmailLoading(true);
    setEmailError('');
    const now = new Date();
    const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
    const days = daysMap[range];
    const dateFrom = days
      ? new Date(now.getTime() - days * 86_400_000).toISOString()
      : '2020-01-01T00:00:00.000Z';
    const dateTo = now.toISOString();
    try {
      const res = await fetch(`/api/email/analytics/overview?dateFrom=${dateFrom}&dateTo=${dateTo}`);
      if (!res.ok) throw new Error('Failed');
      const data: EmailOverviewData = await res.json();
      setEmailData(data);
    } catch {
      setEmailError('Failed to load email analytics.');
    } finally {
      setEmailLoading(false);
    }
  }, []);

  useEffect(() => { fetchEmailAnalytics(emailRange); }, [emailRange, fetchEmailAnalytics]);

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
              sub: overview.gcalConnected ? 'CRM + Google Calendar' : 'CRM only',
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
              label: 'Chat Sessions',
              value: overview.kpis.chatSessions.toLocaleString(),
              sub: 'website chatbot conversations',
              icon: Activity,
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
                { name: 'Website Chatbot',  value: overview.engagement.chats },
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

      {/* ── Email Analytics Section ────────────────────────────────────────────── */}
      <div className="pt-8 border-t border-slate-200 dark:border-slate-700">
        {/* Section header + date range */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-950/40 rounded-lg">
              <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Email Analytics</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Campaign and automation performance</p>
            </div>
          </div>
          <select
            value={emailRange}
            onChange={(e) => setEmailRange(e.target.value)}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 self-start sm:self-auto"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
        </div>

        {emailLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-blue-600 dark:text-blue-400" />
          </div>
        )}

        {emailError && !emailLoading && (
          <div className={`${card} border-red-200 dark:border-red-800 p-4 flex items-center gap-3 mb-6`}>
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-red-700 dark:text-red-400">{emailError}</p>
            <button onClick={() => fetchEmailAnalytics(emailRange)} className="ml-auto text-sm underline text-red-600 dark:text-red-400">Retry</button>
          </div>
        )}

        {!emailLoading && emailData && (
          <div className="space-y-6">
            {/* Row 1 — KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Sent */}
              <div className={`${card} p-4 md:p-6`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Emails Sent</p>
                    <p className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1.5">
                      {emailData.kpis.totalSent.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg flex-shrink-0 bg-blue-50 dark:bg-blue-950/40">
                    <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <div className="flex items-center gap-1 pt-3 border-t border-slate-100 dark:border-slate-800">
                  {emailData.kpis.totalSentChange >= 0
                    ? <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    : <TrendingDown className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />}
                  <span className={`text-xs font-medium ${emailData.kpis.totalSentChange >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {emailData.kpis.totalSentChange >= 0 ? '+' : ''}{emailData.kpis.totalSentChange}% vs prior period
                  </span>
                </div>
              </div>

              {/* Open Rate */}
              <div className={`${card} p-4 md:p-6`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Avg Open Rate</p>
                    <p className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1.5">
                      {emailData.kpis.openRate}%
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg flex-shrink-0 bg-emerald-50 dark:bg-emerald-950/40">
                    <MailOpen className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Industry avg: 35% for healthcare</span>
                </div>
              </div>

              {/* Click Rate */}
              <div className={`${card} p-4 md:p-6`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Avg Click Rate</p>
                    <p className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1.5">
                      {emailData.kpis.clickRate}%
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg flex-shrink-0 bg-purple-50 dark:bg-purple-950/40">
                    <MousePointerClick className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
                <div className="flex items-center gap-1 pt-3 border-t border-slate-100 dark:border-slate-800">
                  {emailData.kpis.clickRate >= 3
                    ? <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    : <TrendingDown className="w-3.5 h-3.5 text-slate-400" />}
                  <span className="text-xs text-slate-500 dark:text-slate-400">Industry avg: ~3%</span>
                </div>
              </div>

              {/* Bounce Rate */}
              <div className={`${card} p-4 md:p-6`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Bounce Rate</p>
                    <p className={`text-2xl md:text-3xl font-semibold tracking-tight mt-1.5 ${emailData.kpis.bounceRate > 2 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-50'}`}>
                      {emailData.kpis.bounceRate}%
                    </p>
                  </div>
                  <div className={`p-2.5 rounded-lg flex-shrink-0 ${emailData.kpis.bounceRate > 2 ? 'bg-red-50 dark:bg-red-950/40' : 'bg-slate-100 dark:bg-slate-800'}`}>
                    <TriangleAlert className={`w-5 h-5 ${emailData.kpis.bounceRate > 2 ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`} />
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  {emailData.kpis.bounceRate > 2 ? (
                    <span className="text-xs font-medium text-red-600 dark:text-red-400">Above 2% threshold — review list health</span>
                  ) : (
                    <span className="text-xs text-slate-500 dark:text-slate-400">Good — below 2% threshold</span>
                  )}
                </div>
              </div>
            </div>

            {/* Row 2 — Emails Sent by Day */}
            <div className={card}>
              <div className={cardHeader}><h3 className={cardTitle}>Emails Sent by Day</h3></div>
              <div className="p-4 md:p-6">
                {emailData.dailyStats.every(d => d.sent === 0) ? (
                  <div className="flex items-center justify-center h-[280px] text-slate-400 dark:text-slate-500 text-sm">
                    No email activity in this period
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={emailData.dailyStats} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        interval={emailData.dailyStats.length > 20 ? Math.floor(emailData.dailyStats.length / 10) : 0}
                      />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="sent"    name="Sent"    fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="opened"  name="Opened"  fill="#10b981" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="clicked" name="Clicked" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Row 3 — Top Templates + Automation Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Performing Templates */}
              <div className={card}>
                <div className={cardHeader}><h3 className={cardTitle}>Top Performing Templates</h3></div>
                {emailData.topTemplates.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-slate-400 dark:text-slate-500 text-sm">
                    No template data for this period
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className={tableHeaderRow}>
                          <th className={tableHeaderCell}>Template</th>
                          <th className={`${tableHeaderCell} text-center`}>Sent</th>
                          <th className={`${tableHeaderCell} text-center`}>Open %</th>
                          <th className={`${tableHeaderCell} text-center`}>Click %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {emailData.topTemplates.map((tmpl, i) => (
                          <tr key={i} className={tableRow}>
                            <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100 max-w-[180px] truncate">{tmpl.name}</td>
                            <td className="py-3 px-4 text-center text-slate-700 dark:text-slate-300">{tmpl.sent.toLocaleString()}</td>
                            <td className="py-3 px-4 text-center">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${tmpl.openRate >= 35 ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' : tmpl.openRate >= 20 ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                                {tmpl.openRate}%
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${tmpl.clickRate >= 3 ? 'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                                {tmpl.clickRate}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Automation Activity */}
              <div className={card}>
                <div className={cardHeader}><h3 className={cardTitle}>Automation Activity</h3></div>
                {emailData.automationActivity.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500 text-sm gap-2">
                    <Zap className="w-8 h-8 opacity-30" />
                    <span>No automation rules configured</span>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {emailData.automationActivity.map((rule) => (
                      <div key={rule.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <div className={`p-1.5 rounded-lg flex-shrink-0 ${rule.isActive ? 'bg-amber-50 dark:bg-amber-950/40' : 'bg-slate-100 dark:bg-slate-800'}`}>
                          <Zap className={`w-4 h-4 ${rule.isActive ? 'text-amber-500 dark:text-amber-400' : 'text-slate-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{rule.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {rule.triggerEvent.replace(/_/g, ' ')}
                            {!rule.isActive && <span className="ml-2 text-slate-400">(inactive)</span>}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-sm font-semibold ${rule.fires > 0 ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}>
                            {rule.fires.toLocaleString()}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">fires</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Row 4 — Recent Campaign Performance */}
            <div className={card}>
              <div className={cardHeader}><h3 className={cardTitle}>Recent Campaign Performance</h3></div>
              {emailData.campaigns.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-slate-400 dark:text-slate-500 text-sm">
                  No campaigns found
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={tableHeaderRow}>
                        <th className={tableHeaderCell}>Campaign</th>
                        <th className={`${tableHeaderCell} text-center`}>Sent Date</th>
                        <th className={`${tableHeaderCell} text-center`}>Recipients</th>
                        <th className={`${tableHeaderCell} text-center`}>Open %</th>
                        <th className={`${tableHeaderCell} text-center`}>Click %</th>
                        <th className={`${tableHeaderCell} text-center`}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {emailData.campaigns.map((c) => {
                        const statusCls: Record<string, string> = {
                          SENT:      'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300',
                          SENDING:   'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300',
                          SCHEDULED: 'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300',
                          PAUSED:    'bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300',
                          CANCELLED: 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300',
                          DRAFT:     'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
                        };
                        return (
                          <tr
                            key={c.id}
                            className={`${tableRow} cursor-pointer`}
                            onClick={() => router.push(`/email/campaigns?detail=${c.id}`)}
                          >
                            <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100 max-w-[200px] truncate">{c.name}</td>
                            <td className="py-3 px-4 text-center text-slate-600 dark:text-slate-400 whitespace-nowrap">
                              {c.sentDate
                                ? new Date(c.sentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                : '—'}
                            </td>
                            <td className="py-3 px-4 text-center text-slate-700 dark:text-slate-300">{c.recipients.toLocaleString()}</td>
                            <td className="py-3 px-4 text-center">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${c.openRate >= 35 ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' : c.openRate > 0 ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                                {c.openRate}%
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${c.clickRate >= 3 ? 'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                                {c.clickRate}%
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-md ${statusCls[c.status] ?? statusCls.DRAFT}`}>
                                {c.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Intake Form Metrics Section */}
      <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 mb-6">Intake Form Metrics</h2>
        
        {metricsLoading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400 mx-auto mb-2" />
            <p className="text-slate-600 dark:text-slate-400">Loading intake form metrics...</p>
          </div>
        ) : metricsError || !metrics ? (
          <div className={`${card} border-red-200 dark:border-red-800`}>
            <div className="p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-red-800 dark:text-red-300">{metricsError || "Failed to load metrics"}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Metrics Summary Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
              <div className={card + " p-4"}>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Total Forms</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">{metrics.summary.totalForms.toLocaleString()}</p>
              </div>
              <div className={card + " p-4"}>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Received (30d)</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">{metrics.summary.totalReceived}</p>
              </div>
              <div className={card + " p-4"}>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Avg Match Conf.</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">{metrics.summary.averageMatchConfidence.toFixed(1)}%</p>
              </div>
              <div className={card + " p-4"}>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Match Rate 85%+</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">{metrics.summary.matchRateOver85}</p>
              </div>
              <div className={card + " p-4"}>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Processing Time</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">{metrics.summary.averageProcessingTimeMinutes.toFixed(1)}m</p>
              </div>
              <div className={card + " p-4"}>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Form Types</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">{metrics.reference.uniqueFormTypes.length}</p>
              </div>
            </div>

            {/* Status Breakdown */}
            <div className={card}>
              <div className={cardHeader}><h3 className={cardTitle}>Status Breakdown</h3></div>
              <div className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {Object.entries(metrics.summary.statusBreakdown).map(([status, count]) => {
                    const colors: Record<string, string> = {
                      RECEIVED: "bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300",
                      MATCHED: "bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300",
                      DRAFT: "bg-yellow-100 dark:bg-yellow-950/50 text-yellow-800 dark:text-yellow-300",
                      LINKED: "bg-purple-100 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300",
                      ARCHIVED: "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300",
                    };
                    return (
                      <div key={status} className="text-center">
                        <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">{count}</p>
                        <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-md mt-2 ${colors[status]}`}>{status}</span>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                          {((count / metrics.summary.totalForms) * 100).toFixed(0)}%
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Form Types */}
            <div className={card}>
              <div className={cardHeader}><h3 className={cardTitle}>Forms by Type</h3></div>
              <div className="p-6 space-y-4">
                {metrics.trends.formTypeBreakdown.length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-400 text-center py-8">No form types found</p>
                ) : (
                  metrics.trends.formTypeBreakdown.map((form, idx) => (
                    <div key={idx}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{form.title}</p>
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{form.count} forms</p>
                      </div>
                      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 transition-all"
                          style={{ width: `${(form.count / Math.max(...metrics.trends.formTypeBreakdown.map(f => f.count), 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
