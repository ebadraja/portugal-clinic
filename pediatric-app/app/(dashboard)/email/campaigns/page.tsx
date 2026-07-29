"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Plus, ArrowLeft, ChevronLeft, ChevronRight, MoreVertical,
  Mail, AlertCircle, Send, Clock, Users, BarChart2,
  CheckCircle2, XCircle, PauseCircle, Copy, Eye,
  Loader2, Calendar, RefreshCw, Search, X, Filter, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type CampaignStatus = "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "PAUSED" | "CANCELLED";

interface CampaignTemplate {
  id: string;
  name: string;
  type: string;
}

interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  template: CampaignTemplate;
  recipientCount: number;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  _count: { logs: number };
}

interface CampaignDetail extends Campaign {
  stats: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    failed: number;
    openRate: number;
    clickRate: number;
  };
}

interface Template {
  id: string;
  name: string;
  type: string;
  subject: string;
  isActive: boolean;
  _count: { logs: number; campaigns: number };
}

interface PickablePatient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  parentName: string | null;
}

interface AudienceFilters {
  ageMin: number;
  ageMax: number;
  lastVisitMonths: string;
  upcomingAppointment: string;
  provider: string;
  visitTypes: string[];
}

interface HourlyTick {
  hour: string;
  sent: number;
  opened: number;
  clicked: number;
}

interface EmailLogRow {
  id: string;
  patientName: string;
  status: string;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const card = "bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm";
const cardHeader = "px-4 md:px-6 py-4 md:py-5 border-b border-slate-200 dark:border-slate-700";
const cardTitle = "text-base font-semibold text-slate-900 dark:text-slate-50";

const STATUS_FILTERS = [
  { label: "All", value: "all" },
  { label: "Draft", value: "DRAFT" },
  { label: "Scheduled", value: "SCHEDULED" },
  { label: "Sending", value: "SENDING" },
  { label: "Sent", value: "SENT" },
  { label: "Paused", value: "PAUSED" },
  { label: "Cancelled", value: "CANCELLED" },
];

const VISIT_TYPE_OPTIONS = [
  { label: "Well Child", value: "WELL_CHILD_VISIT" },
  { label: "Sick Visit", value: "SICK_VISIT" },
  { label: "Developmental", value: "DEVELOPMENTAL" },
];

const WIZARD_STEPS = ["Select Template", "Define Audience", "Personalize", "Schedule & Send"];

const MERGE_TAG_HINTS = [
  "{{patient_first_name}}",
  "{{parent_first_name}}",
  "{{practice_name}}",
  "{{practice_phone}}",
  "{{unsubscribe_link}}",
];

const PICKER_PAGE_SIZE = 15;

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusBadgeClass(status: CampaignStatus): string {
  switch (status) {
    case "DRAFT":      return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
    case "SCHEDULED":  return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    case "SENDING":    return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    case "SENT":       return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
    case "PAUSED":     return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300";
    case "CANCELLED":  return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
    default:           return "bg-slate-100 text-slate-600";
  }
}

function logStatusBadgeClass(status: string): string {
  switch (status) {
    case "DELIVERED":    return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
    case "OPENED":       return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    case "CLICKED":      return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
    case "SENT":         return "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300";
    case "BOUNCED":      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
    case "FAILED":       return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
    case "UNSUBSCRIBED": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300";
    default:             return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
  }
}

function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className={cn("text-xs font-medium px-2.5 py-1 rounded-md", statusBadgeClass(status))}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {WIZARD_STEPS.map((label, i) => {
        const step = i + 1;
        const done = step < currentStep;
        const active = step === currentStep;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors",
                done   ? "bg-blue-600 border-blue-600 text-white" :
                active ? "bg-white dark:bg-slate-900 border-blue-600 text-blue-600" :
                         "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-400"
              )}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : step}
              </div>
              <span className={cn(
                "text-xs mt-1.5 font-medium whitespace-nowrap",
                active ? "text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"
              )}>{label}</span>
            </div>
            {i < WIZARD_STEPS.length - 1 && (
              <div className={cn(
                "flex-1 h-0.5 mx-2 mb-5 transition-colors",
                done ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function EmailCampaignsPage() {
  type View = "list" | "create" | "detail";
  const [view, setView] = useState<View>("list");

  // ── List state ──
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // ── Wizard state ──
  const [wizardStep, setWizardStep] = useState(1);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [audienceFilters, setAudienceFilters] = useState<AudienceFilters>({
    ageMin: 0, ageMax: 18, lastVisitMonths: "", upcomingAppointment: "",
    provider: "", visitTypes: [],
  });
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testEmailSent, setTestEmailSent] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [wizardSuccess, setWizardSuccess] = useState<string | null>(null);

  // ── Template creator state ──
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [newTplName, setNewTplName] = useState("");
  const [newTplSubject, setNewTplSubject] = useState("");
  const [newTplBody, setNewTplBody] = useState("");
  const [tplCreateLoading, setTplCreateLoading] = useState(false);
  const [tplCreateError, setTplCreateError] = useState<string | null>(null);

  // ── Patient picker state ──
  const [audienceMode, setAudienceMode] = useState<"segment" | "specific">("segment");
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerPatients, setPickerPatients] = useState<PickablePatient[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([]);
  const [pickerPage, setPickerPage] = useState(1);
  const [pickerTotal, setPickerTotal] = useState(0);

  // ── Detail state ──
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [detailCampaign, setDetailCampaign] = useState<CampaignDetail | null>(null);
  const [detailHourly, setDetailHourly] = useState<HourlyTick[]>([]);
  const [detailLogs, setDetailLogs] = useState<EmailLogRow[]>([]);
  const [detailLogsTotal, setDetailLogsTotal] = useState(0);
  const [detailLogsPage, setDetailLogsPage] = useState(1);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const recipientDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickerDebounce    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── List fetch ──────────────────────────────────────────────────────────────

  const fetchCampaigns = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const p = new URLSearchParams({ page: String(currentPage), limit: "20" });
      if (statusFilter !== "all") p.set("status", statusFilter);
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo)   p.set("dateTo",   dateTo);
      const res = await fetch(`/api/email/campaigns?${p}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = await res.json();
      setCampaigns(json.data);
      setTotal(json.pagination.total);
      setTotalPages(json.pagination.totalPages);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load campaigns.");
    } finally {
      setListLoading(false);
    }
  }, [statusFilter, dateFrom, dateTo, currentPage]);

  useEffect(() => { if (view === "list") fetchCampaigns(); }, [fetchCampaigns, view]);
  useEffect(() => { setCurrentPage(1); }, [statusFilter, dateFrom, dateTo]);

  // ── Templates fetch (all active templates, not just BULK) ──────────────────

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await fetch("/api/email/templates?limit=50");
      if (!res.ok) throw new Error("Failed to load templates");
      const json = await res.json();
      setTemplates(json.data);
    } catch {
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => { if (view === "create") fetchTemplates(); }, [view, fetchTemplates]);

  // ── Recipient count (segment mode only) ────────────────────────────────────

  const fetchRecipientCount = useCallback(async (id: string, filters: AudienceFilters) => {
    setRecipientsLoading(true);
    try {
      const segmentFilters = {
        ageRange:            [filters.ageMin, filters.ageMax],
        lastVisitMonths:     filters.lastVisitMonths ? parseInt(filters.lastVisitMonths) : undefined,
        upcomingAppointment: filters.upcomingAppointment || undefined,
        provider:            filters.provider || undefined,
        visitTypes:          filters.visitTypes.length ? filters.visitTypes : undefined,
      };
      await fetch(`/api/email/campaigns/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmentFilters }),
      });
      const res = await fetch(`/api/email/campaigns/${id}/recipients`);
      if (res.ok) {
        const json = await res.json();
        setRecipientCount(json.count);
      }
    } catch {
      setRecipientCount(null);
    } finally {
      setRecipientsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!draftId || wizardStep !== 2 || audienceMode !== "segment") return;
    if (recipientDebounce.current) clearTimeout(recipientDebounce.current);
    recipientDebounce.current = setTimeout(() => {
      fetchRecipientCount(draftId, audienceFilters);
    }, 600);
    return () => { if (recipientDebounce.current) clearTimeout(recipientDebounce.current); };
  }, [audienceFilters, draftId, wizardStep, audienceMode, fetchRecipientCount]);

  // ── Patient picker fetch ────────────────────────────────────────────────────

  const fetchPickerPatients = useCallback(async (search: string, page: number) => {
    setPickerLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: String(PICKER_PAGE_SIZE), status: "ACTIVE" });
      if (search.trim()) p.set("search", search.trim());
      const res = await fetch(`/api/patients?${p}`);
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setPickerPatients(json.patients ?? json.data ?? []);
      setPickerTotal(json.total ?? json.pagination?.total ?? 0);
    } catch {
      setPickerPatients([]);
    } finally {
      setPickerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (wizardStep !== 2 || audienceMode !== "specific") return;
    if (pickerDebounce.current) clearTimeout(pickerDebounce.current);
    pickerDebounce.current = setTimeout(() => {
      fetchPickerPatients(pickerSearch, pickerPage);
    }, 300);
    return () => { if (pickerDebounce.current) clearTimeout(pickerDebounce.current); };
  }, [pickerSearch, pickerPage, wizardStep, audienceMode, fetchPickerPatients]);

  // ── Detail fetch ────────────────────────────────────────────────────────────

  const fetchDetail = useCallback(async (id: string, logsPage = 1) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const [campaignRes, analyticsRes, logsRes] = await Promise.all([
        fetch(`/api/email/campaigns/${id}`),
        fetch(`/api/email/analytics/campaign/${id}`),
        fetch(`/api/email/campaigns/${id}/logs?page=${logsPage}&limit=50`),
      ]);
      if (!campaignRes.ok) throw new Error("Campaign not found");
      const [campaignData, analyticsData, logsData] = await Promise.all([
        campaignRes.json(),
        analyticsRes.ok ? analyticsRes.json() : null,
        logsRes.ok ? logsRes.json() : null,
      ]);
      setDetailCampaign(campaignData);
      setDetailHourly(analyticsData?.hourlyTrend ?? []);
      setDetailLogs(logsData?.data ?? []);
      setDetailLogsTotal(logsData?.pagination?.total ?? 0);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Failed to load campaign detail.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "detail" && selectedCampaignId) {
      fetchDetail(selectedCampaignId, detailLogsPage);
    }
  }, [view, selectedCampaignId, detailLogsPage, fetchDetail]);

  // ── Wizard handlers ─────────────────────────────────────────────────────────

  const handleWizardStep1Continue = async () => {
    if (!campaignName.trim()) { setWizardError("Campaign name is required."); return; }
    if (!selectedTemplateId)  { setWizardError("Please select a template."); return; }
    setWizardError(null);
    setWizardLoading(true);
    try {
      const res = await fetch("/api/email/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: campaignName.trim(), templateId: selectedTemplateId }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Failed to create campaign");
      }
      const campaign = await res.json();
      setDraftId(campaign.id);
      setWizardStep(2);
    } catch (err) {
      setWizardError(err instanceof Error ? err.message : "Failed to create campaign.");
    } finally {
      setWizardLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTplName.trim() || !newTplSubject.trim() || !newTplBody.trim()) {
      setTplCreateError("Name, subject line, and email body are all required.");
      return;
    }
    setTplCreateLoading(true);
    setTplCreateError(null);
    try {
      const res = await fetch("/api/email/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:     newTplName.trim(),
          type:     "BULK",
          subject:  newTplSubject.trim(),
          htmlBody: newTplBody.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create template");
      // Prepend to list and auto-select the new template
      setTemplates(prev => [{ ...json, _count: { logs: 0, campaigns: 0 } }, ...prev]);
      setSelectedTemplateId(json.id);
      setShowCreateTemplate(false);
      setNewTplName("");
      setNewTplSubject("");
      setNewTplBody("");
    } catch (err) {
      setTplCreateError(err instanceof Error ? err.message : "Failed to create template.");
    } finally {
      setTplCreateLoading(false);
    }
  };

  const handleStep2Continue = async () => {
    if (audienceMode === "specific" && selectedPatientIds.length === 0) {
      setWizardError("Please select at least one patient.");
      return;
    }
    setWizardError(null);

    // For specific mode — save patient IDs into the campaign's segment filters
    if (audienceMode === "specific" && draftId) {
      try {
        await fetch(`/api/email/campaigns/${draftId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segmentFilters: { specificPatientIds: selectedPatientIds } }),
        });
        setRecipientCount(selectedPatientIds.length);
      } catch {
        // Non-fatal — the send-now route will still use the IDs stored here
      }
    }

    setWizardStep(3);
  };

  const handleSendNow = async () => {
    if (!draftId) return;
    setWizardLoading(true);
    setWizardError(null);
    try {
      const res = await fetch(`/api/email/campaigns/${draftId}/send-now`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to send campaign");
      setWizardSuccess(`Campaign sent to ${json.recipientCount} recipients.`);
      setTimeout(() => { resetWizard(); setView("list"); fetchCampaigns(); }, 2000);
    } catch (err) {
      setWizardError(err instanceof Error ? err.message : "Failed to send campaign.");
    } finally {
      setWizardLoading(false);
    }
  };

  const handleSchedule = async () => {
    if (!draftId || !scheduleDate || !scheduleTime) {
      setWizardError("Please select a date and time.");
      return;
    }
    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`);
    if (scheduledAt <= new Date()) {
      setWizardError("Scheduled time must be in the future.");
      return;
    }
    setWizardLoading(true);
    setWizardError(null);
    try {
      const res = await fetch(`/api/email/campaigns/${draftId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: scheduledAt.toISOString() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to schedule campaign");
      setWizardSuccess(`Campaign scheduled for ${format(scheduledAt, "MMM d, yyyy 'at' h:mm a")}.`);
      setTimeout(() => { resetWizard(); setView("list"); fetchCampaigns(); }, 2000);
    } catch (err) {
      setWizardError(err instanceof Error ? err.message : "Failed to schedule campaign.");
    } finally {
      setWizardLoading(false);
    }
  };

  const resetWizard = () => {
    setWizardStep(1);
    setDraftId(null);
    setCampaignName("");
    setSelectedTemplateId(null);
    setAudienceFilters({ ageMin: 0, ageMax: 18, lastVisitMonths: "", upcomingAppointment: "", provider: "", visitTypes: [] });
    setRecipientCount(null);
    setTestEmail("");
    setTestEmailSent(false);
    setScheduleDate("");
    setScheduleTime("09:00");
    setWizardError(null);
    setWizardSuccess(null);
    setWizardLoading(false);
    // Template creator
    setShowCreateTemplate(false);
    setNewTplName(""); setNewTplSubject(""); setNewTplBody("");
    setTplCreateError(null); setTplCreateLoading(false);
    // Patient picker
    setAudienceMode("segment");
    setPickerSearch(""); setPickerPatients([]); setPickerLoading(false);
    setSelectedPatientIds([]); setPickerPage(1); setPickerTotal(0);
  };

  // ── Detail action handlers ───────────────────────────────────────────────────

  const handleAction = async (action: "pause" | "cancel" | "duplicate") => {
    if (!detailCampaign) return;
    setActionLoading(action);
    setActionMessage(null);
    try {
      if (action === "pause") {
        const res = await fetch(`/api/email/campaigns/${detailCampaign.id}/pause`, { method: "POST" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to pause");
        setActionMessage("Campaign paused.");
        fetchDetail(detailCampaign.id);
      } else if (action === "cancel") {
        const res = await fetch(`/api/email/campaigns/${detailCampaign.id}/cancel`, { method: "POST" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to cancel");
        setActionMessage("Campaign cancelled.");
        fetchDetail(detailCampaign.id);
      } else if (action === "duplicate") {
        const res = await fetch("/api/email/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name:       `${detailCampaign.name} (Copy)`,
            templateId: detailCampaign.template.id,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to duplicate");
        setActionMessage(`Duplicated as "${json.name}".`);
        fetchCampaigns();
      }
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteCampaign = async (id: string, name: string) => {
    if (!confirm(`Delete campaign "${name}"? This permanently removes it and its delivery logs. This cannot be undone.`)) return;
    setActionLoading("delete");
    try {
      const res = await fetch(`/api/email/campaigns/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to delete campaign");
      if (view === "detail") { setView("list"); setDetailCampaign(null); }
      fetchCampaigns();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete campaign");
    } finally {
      setActionLoading(null);
    }
  };

  const openDetail = (id: string) => {
    setSelectedCampaignId(id);
    setDetailLogsPage(1);
    setActionMessage(null);
    setView("detail");
  };

  // ── Showing from/to ─────────────────────────────────────────────────────────
  const showingFrom = total === 0 ? 0 : (currentPage - 1) * 20 + 1;
  const showingTo   = Math.min(currentPage * 20, total);

  // ═══════════════════════════════════════════════════════════════════════════
  // DETAIL VIEW
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "detail") {
    return (
      <div className="pt-4 pb-8 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-2 text-slate-600 dark:text-slate-400" onClick={() => { setView("list"); setDetailCampaign(null); }}>
            <ArrowLeft className="h-4 w-4" /> Back to Campaigns
          </Button>
        </div>

        {detailLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-8 w-64" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
            <Skeleton className="h-72 rounded-xl" />
          </div>
        ) : detailError ? (
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
              <AlertCircle className="h-10 w-10 text-red-500" />
              <p className="font-semibold text-slate-900 dark:text-slate-50">{detailError}</p>
              <Button onClick={() => selectedCampaignId && fetchDetail(selectedCampaignId)}>Try again</Button>
            </CardContent>
          </Card>
        ) : detailCampaign ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">{detailCampaign.name}</h1>
                  <CampaignStatusBadge status={detailCampaign.status} />
                </div>
                <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
                  Template: {detailCampaign.template.name}
                  {detailCampaign.sentAt && (
                    <> · Sent {format(new Date(detailCampaign.sentAt), "MMM d, yyyy")}</>
                  )}
                  {detailCampaign.scheduledAt && detailCampaign.status === "SCHEDULED" && (
                    <> · Scheduled for {format(new Date(detailCampaign.scheduledAt), "MMM d, yyyy 'at' h:mm a")}</>
                  )}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {actionMessage && (
                  <span className="text-sm text-slate-600 dark:text-slate-400 self-center">{actionMessage}</span>
                )}
                {(detailCampaign.status === "SENDING" || detailCampaign.status === "SCHEDULED") && (
                  <Button variant="outline" size="sm" className="gap-2" disabled={actionLoading === "pause"} onClick={() => handleAction("pause")}>
                    {actionLoading === "pause" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
                    Pause
                  </Button>
                )}
                {detailCampaign.status !== "CANCELLED" && detailCampaign.status !== "SENT" && (
                  <Button variant="outline" size="sm" className="gap-2 text-red-600 hover:text-red-700 dark:text-red-400" disabled={actionLoading === "cancel"} onClick={() => handleAction("cancel")}>
                    {actionLoading === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    Cancel
                  </Button>
                )}
                <Button variant="outline" size="sm" className="gap-2" disabled={actionLoading === "duplicate"} onClick={() => handleAction("duplicate")}>
                  {actionLoading === "duplicate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                  Duplicate
                </Button>
                {detailCampaign.status !== "SENDING" && (
                  <Button variant="outline" size="sm" className="gap-2 text-red-600 hover:text-red-700 dark:text-red-400" disabled={actionLoading === "delete"} onClick={() => handleDeleteCampaign(detailCampaign.id, detailCampaign.name)}>
                    {actionLoading === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Delete
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: "Total Sent",   value: detailCampaign.stats.sent,               icon: Send,        color: "text-slate-600 dark:text-slate-400",    bg: "bg-slate-50 dark:bg-slate-800" },
                { label: "Delivered",    value: detailCampaign.stats.delivered,           icon: CheckCircle2, color: "text-green-600 dark:text-green-400",   bg: "bg-green-50 dark:bg-green-950/40" },
                { label: "Opened",       value: `${detailCampaign.stats.openRate}%`,      icon: Eye,         color: "text-blue-600 dark:text-blue-400",      bg: "bg-blue-50 dark:bg-blue-950/40" },
                { label: "Clicked",      value: `${detailCampaign.stats.clickRate}%`,     icon: BarChart2,   color: "text-purple-600 dark:text-purple-400",  bg: "bg-purple-50 dark:bg-purple-950/40" },
                { label: "Bounced",      value: detailCampaign.stats.bounced,             icon: AlertCircle, color: "text-orange-600 dark:text-orange-400",  bg: "bg-orange-50 dark:bg-orange-950/40" },
                { label: "Unsubscribed", value: "—",                                      icon: XCircle,     color: "text-red-600 dark:text-red-400",        bg: "bg-red-50 dark:bg-red-950/40" },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className={cn(card, "p-4")}>
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
                    <div className={cn("p-1.5 rounded-lg", bg)}>
                      <Icon className={cn("w-4 h-4", color)} />
                    </div>
                  </div>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-slate-50">{value}</p>
                </div>
              ))}
            </div>

            <div className={card}>
              <div className={cardHeader}>
                <h2 className={cardTitle}>Emails Sent Over Time</h2>
              </div>
              <div className="p-4 md:p-6">
                {detailHourly.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-2">
                    <BarChart2 className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">No send activity yet</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={detailHourly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => v.slice(11, 16)} />
                      <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
                      <Tooltip labelFormatter={(v) => String(v).slice(0, 16)} />
                      <Line type="monotone" dataKey="sent"    stroke="#3b82f6" strokeWidth={2} dot={false} name="Sent" />
                      <Line type="monotone" dataKey="opened"  stroke="#10b981" strokeWidth={2} dot={false} name="Opened" />
                      <Line type="monotone" dataKey="clicked" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Clicked" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className={card}>
              <div className={cn(cardHeader, "flex items-center justify-between")}>
                <h2 className={cardTitle}>Recipients ({detailLogsTotal})</h2>
                <Button variant="ghost" size="sm" className="gap-2 text-slate-500" onClick={() => selectedCampaignId && fetchDetail(selectedCampaignId, detailLogsPage)}>
                  <RefreshCw className="h-4 w-4" /> Refresh
                </Button>
              </div>
              {detailLogs.length === 0 ? (
                <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                  <Users className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">No email logs yet</p>
                </CardContent>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Patient</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Sent</TableHead>
                        <TableHead>Opened</TableHead>
                        <TableHead>Clicked</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-medium text-slate-900 dark:text-slate-100">{log.patientName}</TableCell>
                          <TableCell>
                            <span className={cn("text-xs font-medium px-2.5 py-1 rounded-md", logStatusBadgeClass(log.status))}>
                              {log.status.charAt(0) + log.status.slice(1).toLowerCase()}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                            {log.sentAt ? format(new Date(log.sentAt), "MMM d, h:mm a") : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                            {log.openedAt ? format(new Date(log.openedAt), "MMM d, h:mm a") : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                            {log.clickedAt ? format(new Date(log.clickedAt), "MMM d, h:mm a") : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {detailLogsTotal > 50 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Showing {(detailLogsPage - 1) * 50 + 1}–{Math.min(detailLogsPage * 50, detailLogsTotal)} of {detailLogsTotal}
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={detailLogsPage === 1} onClick={() => setDetailLogsPage(p => p - 1)} className="gap-1">
                          <ChevronLeft className="h-4 w-4" /> Previous
                        </Button>
                        <Button variant="outline" size="sm" disabled={detailLogsPage * 50 >= detailLogsTotal} onClick={() => setDetailLogsPage(p => p + 1)} className="gap-1">
                          Next <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : null}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE WIZARD VIEW
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === "create") {
    const selectedTemplate = templates.find(t => t.id === selectedTemplateId) ?? null;

    // Patient picker helpers
    const allOnPage = pickerPatients.length > 0 && pickerPatients.every(p => selectedPatientIds.includes(p.id));

    return (
      <div className="pt-4 pb-8 space-y-6 max-w-3xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-2 text-slate-600 dark:text-slate-400" onClick={() => { resetWizard(); setView("list"); }}>
            <ArrowLeft className="h-4 w-4" /> Back to Campaigns
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">New Campaign</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">Send a targeted bulk email to your patient families</p>
        </div>

        <StepIndicator currentStep={wizardStep} />

        {wizardError && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">{wizardError}</p>
          </div>
        )}
        {wizardSuccess && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
            <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
            <p className="text-sm text-green-700 dark:text-green-300">{wizardSuccess}</p>
          </div>
        )}

        {/* ── Step 1: Select Template ── */}
        {wizardStep === 1 && (
          <div className="space-y-6">
            {/* Campaign name */}
            <div className={cn(card, "p-6 space-y-4")}>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Campaign Name</label>
                <Input
                  placeholder="e.g. Spring Wellness Reminder 2025"
                  value={campaignName}
                  onChange={e => { setCampaignName(e.target.value); setWizardError(null); }}
                />
              </div>
            </div>

            {/* Template picker */}
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">Choose a Template</h2>
              {templatesLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {templates.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { setSelectedTemplateId(t.id); setWizardError(null); setShowCreateTemplate(false); }}
                      className={cn(
                        "text-left p-5 rounded-xl border-2 transition-all",
                        selectedTemplateId === t.id
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                          : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm leading-snug">{t.name}</p>
                        {selectedTemplateId === t.id && (
                          <CheckCircle2 className="h-5 w-5 text-blue-500 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">{t.subject}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">{t.type}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">{t._count.campaigns} campaign{t._count.campaigns !== 1 ? "s" : ""}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Inline template creator */}
            {showCreateTemplate ? (
              <div className={cn(card, "p-6 space-y-5 border-blue-200 dark:border-blue-800")}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40">
                      <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">New Bulk Template</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setShowCreateTemplate(false); setTplCreateError(null); }}
                    className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {tplCreateError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" /> {tplCreateError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Template Name</label>
                    <Input
                      placeholder="e.g. Spring Newsletter"
                      value={newTplName}
                      onChange={e => { setNewTplName(e.target.value); setTplCreateError(null); }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Subject Line</label>
                    <Input
                      placeholder="e.g. A message for {{patient_first_name}}'s family"
                      value={newTplSubject}
                      onChange={e => { setNewTplSubject(e.target.value); setTplCreateError(null); }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email Body <span className="text-slate-400 font-normal">(HTML supported)</span></label>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      <span className="text-xs text-slate-400 mr-1">Insert:</span>
                      {MERGE_TAG_HINTS.map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setNewTplBody(b => b + tag)}
                          className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/40 dark:hover:text-blue-400 font-mono transition-colors"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    rows={10}
                    placeholder={"<p>Dear {{parent_first_name}},</p>\n\n<p>We wanted to reach out regarding {{patient_first_name}}'s upcoming care at {{practice_name}}.</p>\n\n<p><a href=\"{{unsubscribe_link}}\">Unsubscribe</a></p>"}
                    value={newTplBody}
                    onChange={e => { setNewTplBody(e.target.value); setTplCreateError(null); }}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Include <span className="font-mono">{"{{unsubscribe_link}}"}</span> in all bulk emails — required for compliance.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowCreateTemplate(false); setTplCreateError(null); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2 bg-blue-600 hover:bg-blue-700"
                    disabled={tplCreateLoading}
                    onClick={handleCreateTemplate}
                  >
                    {tplCreateLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Create & Select
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setShowCreateTemplate(true); setSelectedTemplateId(null); }}
                className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-all text-sm font-medium"
              >
                <Plus className="h-4 w-4" /> Create new template
              </button>
            )}

            <div className="flex justify-end">
              <Button className="gap-2 bg-blue-600 hover:bg-blue-700" disabled={wizardLoading} onClick={handleWizardStep1Continue}>
                {wizardLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Continue
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Define Audience ── */}
        {wizardStep === 2 && (
          <div className="space-y-6">

            {/* Mode toggle */}
            <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(["segment", "specific"] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => { setAudienceMode(mode); setWizardError(null); }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                    audienceMode === mode
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                  )}
                >
                  {mode === "segment" ? (
                    <><Filter className="h-4 w-4" /> By Segment Filters</>
                  ) : (
                    <><Users className="h-4 w-4" /> Pick Specific Patients</>
                  )}
                </button>
              ))}
            </div>

            {/* ── Segment filters (existing) ── */}
            {audienceMode === "segment" && (
              <div className={cn(card, "p-6 space-y-6")}>
                {/* Age range */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                    Age Range: <span className="text-blue-600 dark:text-blue-400">{audienceFilters.ageMin} – {audienceFilters.ageMax} years</span>
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <span className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Min age</span>
                      <input
                        type="range" min={0} max={18} step={1}
                        value={audienceFilters.ageMin}
                        onChange={e => setAudienceFilters(f => ({ ...f, ageMin: Math.min(parseInt(e.target.value), f.ageMax) }))}
                        className="w-full accent-blue-600"
                      />
                    </div>
                    <div className="flex-1">
                      <span className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Max age</span>
                      <input
                        type="range" min={0} max={18} step={1}
                        value={audienceFilters.ageMax}
                        onChange={e => setAudienceFilters(f => ({ ...f, ageMax: Math.max(parseInt(e.target.value), f.ageMin) }))}
                        className="w-full accent-blue-600"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 mt-1">
                    <span>0</span><span>18</span>
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800" />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Last Visit More Than</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number" min={1} placeholder="e.g. 12"
                        className="w-24"
                        value={audienceFilters.lastVisitMonths}
                        onChange={e => setAudienceFilters(f => ({ ...f, lastVisitMonths: e.target.value }))}
                      />
                      <span className="text-sm text-slate-600 dark:text-slate-400">months ago</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Upcoming Appointment</label>
                    <div className="flex gap-2">
                      {[["Any", ""], ["Yes", "yes"], ["No", "no"]].map(([label, val]) => (
                        <button key={val} type="button"
                          onClick={() => setAudienceFilters(f => ({ ...f, upcomingAppointment: val }))}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                            audienceFilters.upcomingAppointment === val
                              ? "bg-blue-600 border-blue-600 text-white"
                              : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-400"
                          )}
                        >{label}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800" />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Specific Doctor</label>
                    <Input
                      placeholder="e.g. Dr. Tamas"
                      value={audienceFilters.provider}
                      onChange={e => setAudienceFilters(f => ({ ...f, provider: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Visit Type History</label>
                    <div className="space-y-2">
                      {VISIT_TYPE_OPTIONS.map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={audienceFilters.visitTypes.includes(opt.value)}
                            onChange={e => setAudienceFilters(f => ({
                              ...f,
                              visitTypes: e.target.checked
                                ? [...f.visitTypes, opt.value]
                                : f.visitTypes.filter(v => v !== opt.value),
                            }))}
                            className="accent-blue-600 w-4 h-4"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Patient picker ── */}
            {audienceMode === "specific" && (
              <div className={cn(card, "p-5 space-y-4")}>
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <Input
                    placeholder="Search by patient or parent name…"
                    value={pickerSearch}
                    onChange={e => { setPickerSearch(e.target.value); setPickerPage(1); }}
                    className="pl-9"
                  />
                </div>

                {/* Selection controls */}
                <div className="flex items-center justify-between text-sm">
                  <span className={cn(
                    "font-semibold",
                    selectedPatientIds.length > 0
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-slate-500 dark:text-slate-400"
                  )}>
                    {selectedPatientIds.length} patient{selectedPatientIds.length !== 1 ? "s" : ""} selected
                  </span>
                  <div className="flex gap-3 text-xs">
                    {pickerPatients.length > 0 && (
                      <button
                        type="button"
                        className="text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        onClick={() => {
                          const pageIds = pickerPatients.map(p => p.id);
                          if (allOnPage) {
                            setSelectedPatientIds(ids => ids.filter(id => !pageIds.includes(id)));
                          } else {
                            setSelectedPatientIds(ids => [...new Set([...ids, ...pageIds])]);
                          }
                        }}
                      >
                        {allOnPage ? "Deselect page" : "Select page"}
                      </button>
                    )}
                    {selectedPatientIds.length > 0 && (
                      <button
                        type="button"
                        className="text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        onClick={() => setSelectedPatientIds([])}
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                </div>

                {/* Patient list */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  {pickerLoading ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-3">
                          <Skeleton className="h-4 w-4 rounded flex-shrink-0" />
                          <div className="flex-1 space-y-1.5">
                            <Skeleton className="h-3.5 w-40" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                          <Skeleton className="h-3 w-12 flex-shrink-0" />
                        </div>
                      ))}
                    </div>
                  ) : pickerPatients.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400">
                      <Users className="h-8 w-8" />
                      <p className="text-sm">{pickerSearch ? "No patients match your search" : "No active patients found"}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                      {pickerPatients.map(p => {
                        const checked = selectedPatientIds.includes(p.id);
                        const age = p.dateOfBirth
                          ? Math.floor((Date.now() - new Date(p.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
                          : null;
                        return (
                          <label
                            key={p.id}
                            className={cn(
                              "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors select-none",
                              checked
                                ? "bg-blue-50 dark:bg-blue-950/20"
                                : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setSelectedPatientIds(ids =>
                                  checked ? ids.filter(id => id !== p.id) : [...ids, p.id]
                                )
                              }
                              className="accent-blue-600 h-4 w-4 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                {p.firstName} {p.lastName}
                              </p>
                              {p.parentName && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                  Parent: {p.parentName}
                                </p>
                              )}
                            </div>
                            {age !== null && (
                              <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">
                                {age} yr{age !== 1 ? "s" : ""}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Picker pagination */}
                {pickerTotal > PICKER_PAGE_SIZE && (
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {(pickerPage - 1) * PICKER_PAGE_SIZE + 1}–{Math.min(pickerPage * PICKER_PAGE_SIZE, pickerTotal)} of {pickerTotal}
                    </p>
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={pickerPage === 1} onClick={() => setPickerPage(p => p - 1)}>
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={pickerPage * PICKER_PAGE_SIZE >= pickerTotal} onClick={() => setPickerPage(p => p + 1)}>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Estimated / selected recipients */}
            <div className={cn(card, "p-4 flex items-center gap-4")}>
              <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/40">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {audienceMode === "specific" ? "Selected Patients" : "Estimated Recipients"}
                </p>
                {audienceMode === "specific" ? (
                  <p className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
                    {selectedPatientIds.length}{" "}
                    <span className="text-sm font-normal text-slate-500 dark:text-slate-400">patients</span>
                  </p>
                ) : recipientsLoading ? (
                  <Skeleton className="h-7 w-24 mt-1" />
                ) : recipientCount !== null ? (
                  <p className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
                    {recipientCount}{" "}
                    <span className="text-sm font-normal text-slate-500 dark:text-slate-400">patients</span>
                  </p>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Calculating…</p>
                )}
              </div>
              {audienceMode === "segment" && recipientCount === 0 && !recipientsLoading && (
                <p className="text-xs text-amber-600 dark:text-amber-400">No matching patients — adjust your filters.</p>
              )}
              {audienceMode === "specific" && selectedPatientIds.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">No patients selected yet.</p>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setWizardStep(1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={handleStep2Continue}>
                Continue <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Personalize ── */}
        {wizardStep === 3 && (
          <div className="space-y-6">
            <div className={cn(card, "p-6 space-y-5")}>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Subject Line</label>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm">
                  <Mail className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1">{selectedTemplate?.subject ?? "—"}</span>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Subject comes from the template. Edit the template to change it.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Campaign Name</label>
                <Input
                  value={campaignName}
                  onChange={e => setCampaignName(e.target.value)}
                />
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800" />

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Send Test Email</label>
                <div className="flex gap-2">
                  <Input
                    type="email" placeholder="your@email.com"
                    value={testEmail}
                    onChange={e => { setTestEmail(e.target.value); setTestEmailSent(false); }}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    disabled={!testEmail || testEmailSent}
                    onClick={() => { setTestEmailSent(true); }}
                    className="gap-2 whitespace-nowrap"
                  >
                    <Send className="h-4 w-4" />
                    {testEmailSent ? "Sent!" : "Send Test"}
                  </Button>
                </div>
                {testEmailSent && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">Test email sent to {testEmail}</p>
                )}
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setWizardStep(2)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={() => { setWizardError(null); setWizardStep(4); }}>
                Continue <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Schedule or Send ── */}
        {wizardStep === 4 && (
          <div className="space-y-6">
            <div className={cn(card, "p-5")}>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Campaign Summary</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Campaign Name</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{campaignName}</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Template</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{selectedTemplate?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Recipients</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                    {audienceMode === "specific"
                      ? `${selectedPatientIds.length} hand-picked patients`
                      : recipientCount !== null ? `~${recipientCount} patients (segment)` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Audience</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                    {audienceMode === "specific" ? "Specific patients" : `Ages ${audienceFilters.ageMin}–${audienceFilters.ageMax} yrs`}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={cn(card, "p-5 flex flex-col gap-4")}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Send className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">Send Now</h3>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Emails will be queued and sent immediately.</p>
                </div>
                <Button className="gap-2 bg-blue-600 hover:bg-blue-700 w-full" disabled={wizardLoading} onClick={handleSendNow}>
                  {wizardLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send Now
                </Button>
              </div>

              <div className={cn(card, "p-5 flex flex-col gap-4")}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">Schedule</h3>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Pick a future date and time to send.</p>
                </div>
                <div className="space-y-2">
                  <Input
                    type="date"
                    min={new Date().toISOString().slice(0, 10)}
                    value={scheduleDate}
                    onChange={e => setScheduleDate(e.target.value)}
                  />
                  <Input
                    type="time"
                    value={scheduleTime}
                    onChange={e => setScheduleTime(e.target.value)}
                  />
                </div>
                <Button variant="outline" className="gap-2 w-full" disabled={wizardLoading || !scheduleDate} onClick={handleSchedule}>
                  {wizardLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
                  Schedule
                </Button>
              </div>
            </div>

            <div className="flex justify-start">
              <Button variant="outline" onClick={() => setWizardStep(3)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST VIEW (default)
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="pt-4 pb-8 space-y-6">

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Email Campaigns</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">Manage and send bulk email campaigns to patient families</p>
        </div>
        <Button
          className="gap-2 bg-blue-600 hover:bg-blue-700 self-start sm:self-auto"
          onClick={() => { resetWizard(); setView("create"); }}
        >
          <Plus className="h-4 w-4" /> New Campaign
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex gap-2 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <Button
                key={f.value}
                variant={statusFilter === f.value ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(f.value)}
              >{f.label}</Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">From</span>
              <Input type="date" className="w-40" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600 dark:text-slate-400">To</span>
              <Input type="date" className="w-40" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" className="text-slate-500" onClick={() => { setDateFrom(""); setDateTo(""); }}>
                Clear dates
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {listLoading ? (
        <Card>
          <CardContent className="p-0">
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-40 flex-shrink-0" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16 ml-auto" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : listError ? (
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <div className="text-center">
              <p className="font-semibold text-slate-900 dark:text-slate-50">Failed to load campaigns</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{listError}</p>
            </div>
            <Button onClick={fetchCampaigns}>Try again</Button>
          </CardContent>
        </Card>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="h-16 w-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <Mail className="h-8 w-8 text-slate-400" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-900 dark:text-slate-50">No campaigns found</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {statusFilter !== "all" || dateFrom || dateTo
                  ? "Try adjusting your filters."
                  : "Create your first email campaign to get started."}
              </p>
            </div>
            {statusFilter === "all" && !dateFrom && !dateTo && (
              <Button className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={() => { resetWizard(); setView("create"); }}>
                <Plus className="h-4 w-4" /> Create First Campaign
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead className="text-right">Recipients</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-center">Open Rate</TableHead>
                  <TableHead>Scheduled / Sent Date</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map(c => {
                  const dateLabel = c.status === "SENT"
                    ? c.sentAt ? format(new Date(c.sentAt), "MMM d, yyyy") : "—"
                    : c.scheduledAt ? format(new Date(c.scheduledAt), "MMM d, yyyy") : "—";

                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      onClick={() => openDetail(c.id)}
                    >
                      <TableCell className="font-medium text-slate-900 dark:text-slate-100">{c.name}</TableCell>
                      <TableCell><CampaignStatusBadge status={c.status} /></TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400 text-sm">{c.template.name}</TableCell>
                      <TableCell className="text-right text-slate-700 dark:text-slate-300">{c.recipientCount}</TableCell>
                      <TableCell className="text-right text-slate-700 dark:text-slate-300">{c._count.logs}</TableCell>
                      <TableCell className="text-center text-slate-500 dark:text-slate-400">—</TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400 text-sm">{dateLabel}</TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors">
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openDetail(c.id)}>
                              <Eye className="h-4 w-4" /> View
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={async e => {
                              e.stopPropagation();
                              await fetch("/api/email/campaigns", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ name: `${c.name} (Copy)`, templateId: c.template.id }),
                              });
                              fetchCampaigns();
                            }}>
                              <Copy className="h-4 w-4" /> Duplicate
                            </DropdownMenuItem>
                            {c.status !== "SENDING" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="gap-2 cursor-pointer text-red-600 dark:text-red-400 focus:text-red-600"
                                  onClick={(e) => { e.stopPropagation(); handleDeleteCampaign(c.id, c.name); }}
                                >
                                  <Trash2 className="h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Showing {showingFrom}–{showingTo} of {total} campaigns
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="gap-1">
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="gap-1">
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
