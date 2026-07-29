"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AddPatientDialog from "@/components/patients/add-patient-dialog";
import CSVImportModal from "@/components/csv-import-modal";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Plus,
  Upload,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  User,
  Eye,
  Edit,
  Archive,
  Trash2,
  AlertCircle,
  FileText,
  MailCheck,
  MailX,
  Mail,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

// ── Interfaces ────────────────────────────────────────────────────────────────

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string | null;
  parentName: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED" | "DRAFT";
  totalVisits: number;
  lastVisitAt: string | null;
  insuranceProvider: string | null;
  insurancePlanType: string | null;
  insurancePlan: string | null;
  insuranceMemberId: string | null;
  _count: { appointments: number };
}

interface DraftPatient {
  id: string;
  formId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string | null;
  phone: string | null;
  parentName: string | null;
  parentPhone: string | null;
  extractedData: Record<string, any>;
  submittedAt: string;
  matchConfidence: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type StatusFilter = "all" | "ACTIVE" | "INACTIVE" | "ARCHIVED" | "DRAFT";

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-green-100 text-green-700",
  "bg-purple-100 text-purple-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-teal-100 text-teal-700",
];

function getAvatarColor(name: string): string {
  const sum = name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

function calculateAge(dateOfBirth: string): number {
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function formatRelativeTime(date: string | null): string {
  if (!date) return "Never";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "1 week ago";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return "1 month ago";
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

const STATUS_FILTER_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All Patients", value: "all" },
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
  { label: "Draft", value: "DRAFT" },
  { label: "Archived", value: "ARCHIVED" },
];

function StatusBadge({ status }: { status: Patient["status"] }) {
  if (status === "ACTIVE")
    return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-0">Active</Badge>;
  if (status === "INACTIVE")
    return <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 border-0">Inactive</Badge>;
  if (status === "DRAFT")
    return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0">Draft</Badge>;
  return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-0">Archived</Badge>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PatientsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("all");

  // All Patients State
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([]);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Draft Patients State
  const [draftPatients, setDraftPatients] = useState<DraftPatient[]>([]);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftCurrentPage, setDraftCurrentPage] = useState(1);
  const [draftPagination, setDraftPagination] = useState<Pagination | null>(null);
  const [draftSearchTerm, setDraftSearchTerm] = useState("");
  const [debouncedDraftSearch, setDebouncedDraftSearch] = useState("");

  // Email status indicators
  const [emailStatuses, setEmailStatuses] = useState<Record<string, { status: string; templateName: string; sentAt: string | null } | null>>({});

  // Debounce search 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedDraftSearch(draftSearchTerm);
      setDraftCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [draftSearchTerm]);

  // Reset page when filter changes
  useEffect(() => { setCurrentPage(1); }, [statusFilter]);

  // Clear selection when list data changes
  useEffect(() => { setSelectedPatientIds([]); }, [patients]);
  useEffect(() => { setSelectedDraftIds([]); }, [draftPatients]);

  // Fetch patients
  const fetchPatients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: "20" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/patients?${params}`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const json = await res.json();
      setPatients(json.data);
      setPagination(json.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load patients.");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, currentPage]);

  // Fetch draft patients — from PatientDraft model (real names)
  const fetchDraftPatients = useCallback(async () => {
    setDraftLoading(true);
    setDraftError(null);
    try {
      const params = new URLSearchParams({ page: String(draftCurrentPage), limit: "20", status: "PENDING" });
      if (debouncedDraftSearch) params.set("search", debouncedDraftSearch);

      const res = await fetch(`/api/patient-drafts?${params}`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const json = await res.json();

      const drafts: DraftPatient[] = json.data.map((d: any) => ({
        id: d.id,
        formId: d.intakeForms?.[0]?.id ?? d.id,
        firstName: d.firstName || "Unknown",
        lastName: d.lastName || "",
        dateOfBirth: d.dateOfBirth || "",
        email: d.email || null,
        phone: d.phone || null,
        parentName: null,
        parentPhone: null,
        extractedData: {},
        submittedAt: d.createdAt,
        matchConfidence: 0,
      }));

      setDraftPatients(drafts);
      setDraftPagination(json.pagination);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Failed to load draft patients.");
    } finally {
      setDraftLoading(false);
    }
  }, [debouncedDraftSearch, draftCurrentPage]);

  useEffect(() => { fetchPatients(); }, [fetchPatients]);
  useEffect(() => { if (activeTab === "draft") fetchDraftPatients(); }, [activeTab, fetchDraftPatients]);

  // Fetch email statuses for visible patients after each load
  useEffect(() => {
    if (patients.length === 0) return;
    const ids = patients.map(p => p.id).join(',');
    fetch(`/api/patients/email-status?ids=${ids}`)
      .then(r => r.ok ? r.json() : {})
      .then((data) => setEmailStatuses(prev => ({ ...prev, ...data })))
      .catch(() => {});
  }, [patients]);

  // Navigate to draft profile page (looks like full patient profile)
  const handleViewDraft = (draft: DraftPatient) => {
    router.push(`/patient-drafts/${draft.id}`);
  };

  const handleConvertDraft = (draft: DraftPatient) => {
    router.push(`/patient-drafts/${draft.id}`);
  };

  const handleDiscardDraft = async (draft: DraftPatient) => {
    if (!confirm(`Discard intake form for ${draft.firstName} ${draft.lastName}? This will archive the form.`)) return;
    try {
      const res = await fetch(`/api/intake-forms/${draft.formId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ARCHIVED' }),
      });
      if (res.ok) fetchDraftPatients();
    } catch (e) {
      console.error('Discard failed', e);
    }
  };

  const runPatientBulkAction = async (action: "activate" | "draft" | "archive", ids: string[]) => {
    if (ids.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/patients/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      if (!res.ok) throw new Error("Bulk update failed");
      setSelectedPatientIds([]);
      await fetchPatients();
    } catch (e) {
      console.error("Patient bulk action failed", e);
      alert("Failed to update selected patients. Please try again.");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleArchivePatient = async (patientId: string) => {
    if (!confirm("Archive this patient? They will be marked ARCHIVED (not permanently deleted).")) return;
    try {
      const res = await fetch(`/api/patients/${patientId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Archive failed");
      await fetchPatients();
    } catch (e) {
      console.error("Archive failed", e);
      alert("Failed to archive patient.");
    }
  };

  const handleSetPatientDraft = async (patientId: string) => {
    if (!confirm("Move this patient to Draft status?")) return;
    await runPatientBulkAction("draft", [patientId]);
  };

  const handleBulkConvertDrafts = async () => {
    const selected = draftPatients.filter((d) => selectedDraftIds.includes(d.id));
    if (selected.length === 0 || bulkBusy) return;
    if (!confirm(`Convert ${selected.length} draft${selected.length === 1 ? "" : "s"} to patient records?`)) return;

    setBulkBusy(true);
    let success = 0;
    let failed = 0;
    try {
      for (const draft of selected) {
        try {
          const res = await fetch(`/api/patient-drafts/${draft.id}/publish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes: "bulk convert" }),
          });
          if (res.ok) success += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }
      setSelectedDraftIds([]);
      await fetchDraftPatients();
      alert(`Converted ${success} draft${success === 1 ? "" : "s"}${failed ? `; ${failed} failed` : ""}.`);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkDiscardDrafts = async () => {
    const selected = draftPatients.filter((d) => selectedDraftIds.includes(d.id));
    if (selected.length === 0 || bulkBusy) return;
    if (!confirm(`Discard ${selected.length} draft${selected.length === 1 ? "" : "s"}? Linked intake forms will be archived.`)) return;

    setBulkBusy(true);
    let success = 0;
    let failed = 0;
    try {
      for (const draft of selected) {
        try {
          const res = await fetch(`/api/intake-forms/${draft.formId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "ARCHIVED" }),
          });
          if (res.ok) success += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }
      setSelectedDraftIds([]);
      await fetchDraftPatients();
      alert(`Discarded ${success} draft${success === 1 ? "" : "s"}${failed ? `; ${failed} failed` : ""}.`);
    } finally {
      setBulkBusy(false);
    }
  };

  const togglePatientSelected = (id: string) => {
    setSelectedPatientIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleDraftSelected = (id: string) => {
    setSelectedDraftIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const allPatientsOnPageSelected =
    patients.length > 0 && patients.every((p) => selectedPatientIds.includes(p.id));
  const allDraftsOnPageSelected =
    draftPatients.length > 0 && draftPatients.every((d) => selectedDraftIds.includes(d.id));

  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;
  const showingFrom = total === 0 ? 0 : (currentPage - 1) * 20 + 1;
  const showingTo = Math.min(currentPage * 20, total);

  const draftTotal = draftPagination?.total ?? 0;
  const draftTotalPages = draftPagination?.totalPages ?? 1;
  const draftShowingFrom = draftTotal === 0 ? 0 : (draftCurrentPage - 1) * 20 + 1;
  const draftShowingTo = Math.min(draftCurrentPage * 20, draftTotal);

  // ── Skeleton rows ──────────────────────────────────────────────────────────
  if (loading && activeTab === "all") {
    return (
      <div className="pt-4 pb-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-36" />
          </div>
        </div>
        <Card>
          <CardHeader><Skeleton className="h-10 w-full" /></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-8 w-8 rounded" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="pt-4 pb-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Patients</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">Manage your patient database</p>
        </div>
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <div className="text-center">
              <p className="font-semibold text-slate-900 dark:text-slate-50">Failed to load patients</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{error}</p>
            </div>
            <Button onClick={() => { setError(null); setLoading(true); setCurrentPage(1); }}>
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="pt-4 pb-8 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Patients</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">Manage your patient database</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setIsImportOpen(true)}
          >
            <Upload className="h-4 w-4" />
            Bulk Import
          </Button>
          <Button className="gap-2" onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Add New Patient
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => value && setActiveTab(value)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 dark:bg-slate-800">
          <TabsTrigger value="all" className="dark:text-slate-300">All Patients</TabsTrigger>
          <TabsTrigger value="draft" className="dark:text-slate-300">
            <FileText className="h-4 w-4 mr-2" />
            Draft Patients
          </TabsTrigger>
        </TabsList>

        {/* ── All Patients Tab ── */}
        <TabsContent value="all" className="space-y-6">
          {/* Search + Filters */}
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by name, phone, or parent name..."
                  className="pl-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex gap-2 flex-wrap">
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    variant={statusFilter === opt.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStatusFilter(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Empty state */}
          {patients.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="h-16 w-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <User className="h-8 w-8 text-slate-400" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-slate-900 dark:text-slate-50">No patients found</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {debouncedSearch || statusFilter !== "all"
                      ? "Try adjusting your search or filter criteria."
                      : "Add your first patient to get started."}
                  </p>
                </div>
                {!debouncedSearch && statusFilter === "all" && (
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add First Patient
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            /* Table */
            <Card>
              {selectedPatientIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-blue-50/70 dark:bg-blue-950/30">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200 mr-2">
                    {selectedPatientIds.length} selected
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulkBusy}
                    onClick={() => void runPatientBulkAction("activate", selectedPatientIds)}
                  >
                    Set to Active
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulkBusy}
                    onClick={() => void runPatientBulkAction("draft", selectedPatientIds)}
                  >
                    Set to Draft
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-orange-700 border-orange-200"
                    disabled={bulkBusy}
                    onClick={() => void runPatientBulkAction("archive", selectedPatientIds)}
                  >
                    Archive selected
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={bulkBusy}
                    onClick={() => setSelectedPatientIds([])}
                  >
                    Clear
                  </Button>
                </div>
              )}
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allPatientsOnPageSelected}
                          onCheckedChange={(checked) => {
                            if (checked === true) {
                              setSelectedPatientIds(patients.map((p) => p.id));
                            } else {
                              setSelectedPatientIds([]);
                            }
                          }}
                          aria-label="Select all patients on this page"
                        />
                      </TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>DOB</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Insurance</TableHead>
                      <TableHead>Last Visit</TableHead>
                      <TableHead className="text-center">Total Visits</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {patients.map((patient) => {
                      const fullName = `${patient.firstName} ${patient.lastName}`;
                      const avatarColor = getAvatarColor(fullName);
                      return (
                        <TableRow
                          key={patient.id}
                          className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                          onClick={() => router.push(`/patients/${patient.id}`)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedPatientIds.includes(patient.id)}
                              onCheckedChange={() => togglePatientSelected(patient.id)}
                              aria-label={`Select ${fullName}`}
                            />
                          </TableCell>
                          {/* Patient name + parent */}
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${avatarColor}`}>
                                {getInitials(patient.firstName, patient.lastName)}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <p className="font-medium text-slate-900 dark:text-slate-100">{fullName}</p>
                                  {(() => {
                                    const es = emailStatuses[patient.id];
                                    if (!es) return null;
                                    const good = ["SENT","DELIVERED","OPENED","CLICKED"].includes(es.status);
                                    const bad  = ["FAILED","BOUNCED"].includes(es.status);
                                    const dateStr = es.sentAt ? format(new Date(es.sentAt), "MMM d, yyyy") : null;
                                    const tip = `Last email: ${es.templateName} — ${es.status}${dateStr ? ` on ${dateStr}` : ""}`;
                                    if (good) return <span title={tip} className="flex-shrink-0"><MailCheck className="h-3.5 w-3.5 text-emerald-500" /></span>;
                                    if (bad)  return <span title={tip} className="flex-shrink-0"><MailX className="h-3.5 w-3.5 text-red-500" /></span>;
                                    return <span title={tip} className="flex-shrink-0"><Mail className="h-3.5 w-3.5 text-amber-500" /></span>;
                                  })()}
                                </div>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{patient.parentName ?? "—"}</p>
                              </div>
                            </div>
                          </TableCell>

                          {/* DOB + age */}
                          <TableCell className="text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {format(new Date(patient.dateOfBirth), "MMM d, yyyy")}
                            <span className="text-slate-500 dark:text-slate-400"> ({calculateAge(patient.dateOfBirth)} yrs)</span>
                          </TableCell>

                          {/* Phone */}
                          <TableCell className="text-slate-700 dark:text-slate-300">
                            {patient.phone ?? "—"}
                          </TableCell>

                          {/* Insurance */}
                          <TableCell className="text-slate-700 dark:text-slate-300 text-sm">
                            {patient.insurancePlan ? (
                              <div>
                                <p className="font-medium leading-tight">{patient.insurancePlan}</p>
                                {patient.insurancePlanType && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400">{patient.insurancePlanType}</p>
                                )}
                              </div>
                            ) : patient.insuranceProvider ? (
                              <span>{patient.insuranceProvider}</span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">—</span>
                            )}
                          </TableCell>

                          {/* Last visit */}
                          <TableCell className="text-slate-600 dark:text-slate-400">
                            {formatRelativeTime(patient.lastVisitAt)}
                          </TableCell>

                          {/* Total visits */}
                          <TableCell className="text-center font-medium text-slate-900 dark:text-slate-100">
                            {patient.totalVisits}
                          </TableCell>

                          {/* Status badge */}
                          <TableCell>
                            <StatusBadge status={patient.status} />
                          </TableCell>

                          {/* Actions — stop row click from firing */}
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors">
                                <MoreVertical className="h-4 w-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={() => router.push(`/patients/${patient.id}`)}
                                >
                                  <Eye className="h-4 w-4" /> View
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => router.push(`/patients/${patient.id}?edit=1`)}>
                                  <Edit className="h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="gap-2 cursor-pointer"
                                  onClick={() => void handleSetPatientDraft(patient.id)}
                                >
                                  <FileText className="h-4 w-4" /> Set to Draft
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="gap-2 text-orange-600 focus:text-orange-600 cursor-pointer"
                                  onClick={() => void handleArchivePatient(patient.id)}
                                >
                                  <Archive className="h-4 w-4" /> Archive
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {pagination && totalPages > 1 && (
                  <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Showing {showingFrom}–{showingTo} of {total} patients
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="gap-1"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="gap-1"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Draft Patients Tab ── */}
        <TabsContent value="draft" className="space-y-6">
          {draftLoading ? (
            <Card>
              <CardContent className="p-0">
                <div className="space-y-4 p-6">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-1/4" />
                      </div>
                      <Skeleton className="h-6 w-16 rounded-full" />
                      <Skeleton className="h-8 w-8 rounded" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : draftError ? (
            <Card className="border-red-200 dark:border-red-800">
              <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
                <AlertCircle className="h-10 w-10 text-red-500" />
                <div className="text-center">
                  <p className="font-semibold text-slate-900 dark:text-slate-50">Failed to load draft patients</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{draftError}</p>
                </div>
                <Button onClick={() => fetchDraftPatients()}>Try again</Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Search */}
              <Card>
                <CardContent className="pt-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search by name or form ID..."
                      className="pl-9"
                      value={draftSearchTerm}
                      onChange={(e) => setDraftSearchTerm(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Draft Patients Table */}
              {draftPatients.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                    <div className="h-16 w-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <FileText className="h-8 w-8 text-slate-400" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-slate-900 dark:text-slate-50">No draft patients</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">All intake forms have been matched or processed.</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  {selectedDraftIds.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-amber-50/70 dark:bg-amber-950/30">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200 mr-2">
                        {selectedDraftIds.length} selected
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={bulkBusy}
                        onClick={() => void handleBulkConvertDrafts()}
                      >
                        Convert to Patient
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-700 border-red-200"
                        disabled={bulkBusy}
                        onClick={() => void handleBulkDiscardDrafts()}
                      >
                        Discard selected
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={bulkBusy}
                        onClick={() => setSelectedDraftIds([])}
                      >
                        Clear
                      </Button>
                    </div>
                  )}
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              checked={allDraftsOnPageSelected}
                              onCheckedChange={(checked) => {
                                if (checked === true) {
                                  setSelectedDraftIds(draftPatients.map((d) => d.id));
                                } else {
                                  setSelectedDraftIds([]);
                                }
                              }}
                              aria-label="Select all drafts on this page"
                            />
                          </TableHead>
                          <TableHead>Patient Name</TableHead>
                          <TableHead>DOB</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Parent/Guardian</TableHead>
                          <TableHead>Submitted</TableHead>
                          <TableHead className="text-center">Confidence</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {draftPatients.map((draft) => {
                          const fullName = `${draft.firstName} ${draft.lastName}`;
                          const avatarColor = getAvatarColor(fullName);
                          const confBg = draft.matchConfidence >= 85 
                            ? "bg-green-100 text-green-700"
                            : draft.matchConfidence >= 50 
                            ? "bg-blue-100 text-blue-700"
                            : "bg-amber-100 text-amber-700";
                          
                          return (
                            <TableRow key={draft.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedDraftIds.includes(draft.id)}
                                  onCheckedChange={() => toggleDraftSelected(draft.id)}
                                  aria-label={`Select ${fullName}`}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${avatarColor}`}>
                                    {getInitials(draft.firstName, draft.lastName)}
                                  </div>
                                  <div>
                                    <p className="font-medium text-slate-900 dark:text-slate-100">{fullName}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Form: {draft.formId.slice(0, 8)}...</p>
                                  </div>
                                </div>
                              </TableCell>

                              <TableCell className="text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                {draft.dateOfBirth ? format(new Date(draft.dateOfBirth), "MMM d, yyyy") : "—"}
                              </TableCell>

                              <TableCell className="text-slate-700 dark:text-slate-300">
                                {draft.phone ?? "—"}
                              </TableCell>

                              <TableCell className="text-slate-600 dark:text-slate-400">
                                {draft.parentName ?? "—"}
                              </TableCell>

                              <TableCell className="text-slate-600 dark:text-slate-400 text-sm">
                                {formatRelativeTime(draft.submittedAt)}
                              </TableCell>

                              <TableCell>
                                <Badge className={`${confBg} hover:${confBg} border-0`}>
                                  {Math.round(draft.matchConfidence)}%
                                </Badge>
                              </TableCell>

                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <DropdownMenu>
                                  <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors">
                                    <MoreVertical className="h-4 w-4" />
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-44">
                                    <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => handleViewDraft(draft)}>
                                      <Eye className="h-4 w-4" /> View Details
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => handleConvertDraft(draft)}>
                                      <Edit className="h-4 w-4" /> Convert to Patient
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="gap-2 cursor-pointer text-red-600 focus:text-red-600" onClick={() => handleDiscardDraft(draft)}>
                                      <Trash2 className="h-4 w-4" /> Discard
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>

                    {/* Pagination */}
                    {draftPagination && draftTotalPages > 1 && (
                      <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800">
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Showing {draftShowingFrom}–{draftShowingTo} of {draftTotal} draft patients
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDraftCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={draftCurrentPage === 1}
                            className="gap-1"
                          >
                            <ChevronLeft className="h-4 w-4" />
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDraftCurrentPage((p) => Math.min(draftTotalPages, p + 1))}
                            disabled={draftCurrentPage === draftTotalPages}
                            className="gap-1"
                          >
                            Next
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <AddPatientDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSuccess={() => { setCurrentPage(1); fetchPatients(); }}
      />
      <CSVImportModal
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImportComplete={() => {
          setCurrentPage(1);
          void fetchPatients();
        }}
      />
    </div>
  );
}
