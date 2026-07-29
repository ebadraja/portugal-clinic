"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  FileText, Search, ChevronLeft, ChevronRight, Eye, UserPlus,
  Loader, Download, Trash2, RotateCcw, AlertTriangle, Trash, ScanEye,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface IntakeFormListItem {
  id: string;
  hippatizFormTitle: string;
  hippatizViewLink?: string | null;
  hippatizPdfLink?: string | null;
  status: "RECEIVED" | "MATCHED" | "DRAFT" | "LINKED" | "ARCHIVED";
  matchConfidence?: number;
  submittedAt: string;
  deletedAt?: string | null;
  linkedPatientId?: string;
  linkedPatientName?: string;
  draftPatientId?: string;
  draftPatientName?: string;
}

interface PatientSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  status: string;
}

interface PaginationMeta { page: number; limit: number; total: number; totalPages: number; }

type DeleteDialogState = { open: false } | { open: true; ids: string[]; label: string };

export default function IntakeFormsPage() {
  const router = useRouter();
  const [forms, setForms] = useState<IntakeFormListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [selectedFormType, setSelectedFormType] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({ open: false });
  const [overviewForm, setOverviewForm] = useState<IntakeFormListItem | null>(null);
  const [overviewFields, setOverviewFields] = useState<Array<{ fieldLabel: string; value: string }>>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [selectedForm, setSelectedForm] = useState<IntakeFormListItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Assign-patient modal state
  const [assignSearch, setAssignSearch] = useState("");
  const [assignResults, setAssignResults] = useState<PatientSearchResult[]>([]);
  const [assignSearching, setAssignSearching] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState(false);
  const [assignError, setAssignError] = useState("");

  const fetchForms = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: "20",
        trash: String(showTrash),
        ...(selectedStatus !== "all" && !showTrash && { status: selectedStatus }),
        ...(selectedFormType !== "all" && { formType: selectedFormType }),
        ...(searchTerm && { search: searchTerm }),
      });
      const res = await fetch(`/api/intake-forms?${params}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setForms(data.data || []);
      setPagination(data.pagination);
      setSelectedIds(new Set());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [currentPage, selectedStatus, searchTerm, showTrash, selectedFormType]);

  useEffect(() => { fetchForms(); }, [fetchForms]);

  // ── Assign-patient search ────────────────────────────────────────────────────
  useEffect(() => {
    if (!showMatchModal || assignSearch.length < 2) {
      setAssignResults([]);
      return;
    }
    setAssignSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/patients?search=${encodeURIComponent(assignSearch)}&limit=8&status=ACTIVE`
        );
        if (res.ok) {
          const data = await res.json();
          setAssignResults(data.data || []);
        }
      } catch {
        /* silent */
      } finally {
        setAssignSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [assignSearch, showMatchModal]);

  const openAssignModal = (form: IntakeFormListItem) => {
    setSelectedForm(form);
    setAssignSearch("");
    setAssignResults([]);
    setAssignSuccess(false);
    setAssignError("");
    setShowMatchModal(true);
  };

  const closeAssignModal = () => {
    setShowMatchModal(false);
    setAssignSearch("");
    setAssignResults([]);
    setAssignSuccess(false);
    setAssignError("");
  };

  const handleAssignPatient = async (patient: PatientSearchResult) => {
    if (!selectedForm) return;
    setAssignLoading(true);
    setAssignError("");
    try {
      const res = await fetch(`/api/intake-forms/${selectedForm.id}/match-patient`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: patient.id,
          notes: "Manually assigned by staff",
        }),
      });
      if (!res.ok) throw new Error("Failed to assign");
      setAssignSuccess(true);
      setTimeout(() => {
        closeAssignModal();
        fetchForms();
      }, 1200);
    } catch {
      setAssignError("Assignment failed — please try again.");
    } finally {
      setAssignLoading(false);
    }
  };

  // ── Selection helpers ────────────────────────────────────────────────────────
  const allSelected = forms.length > 0 && forms.every((f) => selectedIds.has(f.id));
  const someSelected = selectedIds.size > 0;

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(forms.map((f) => f.id)));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Single-form actions ──────────────────────────────────────────────────────
  const openOverview = async (form: IntakeFormListItem) => {
    setOverviewForm(form);
    setOverviewLoading(true);
    setOverviewFields([]);
    try {
      const res = await fetch(`/api/intake-forms/${form.id}`);
      if (res.ok) {
        const data = await res.json();
        const fields = (data.fieldValues || [])
          .filter((f: any) => f.value && f.value.trim() !== "")
          .map((f: any) => ({ fieldLabel: f.fieldLabel || f.fieldId, value: f.value }));
        setOverviewFields(fields);
      }
    } finally {
      setOverviewLoading(false);
    }
  };

  const openDeleteDialog = (form: IntakeFormListItem) => {
    setDeleteDialog({ open: true, ids: [form.id], label: `"${form.hippatizFormTitle}"` });
  };

  const openBulkDeleteDialog = () => {
    setDeleteDialog({ open: true, ids: Array.from(selectedIds), label: `${selectedIds.size} form(s)` });
  };

  const handleTrash = async (ids: string[]) => {
    setActionLoading(true);
    try {
      await fetch("/api/intake-forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "trash", ids }),
      });
      fetchForms();
    } finally {
      setActionLoading(false);
      setDeleteDialog({ open: false });
    }
  };

  const handlePermanentDelete = async (ids: string[]) => {
    setActionLoading(true);
    try {
      if (ids.length === 1) {
        await fetch(`/api/intake-forms/${ids[0]}`, { method: "DELETE" });
      } else {
        await fetch("/api/intake-forms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", ids }),
        });
      }
      fetchForms();
    } finally {
      setActionLoading(false);
      setDeleteDialog({ open: false });
    }
  };

  const handleRestore = async (ids: string[]) => {
    setActionLoading(true);
    try {
      await fetch("/api/intake-forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", ids }),
      });
      fetchForms();
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkArchive = async () => {
    setActionLoading(true);
    try {
      await fetch("/api/intake-forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive", ids: Array.from(selectedIds) }),
      });
      fetchForms();
    } finally {
      setActionLoading(false);
    }
  };

  // ── Style helpers ────────────────────────────────────────────────────────────
  const statusColor: Record<string, string> = {
    RECEIVED: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    MATCHED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    DRAFT: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    LINKED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    ARCHIVED: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300",
  };
  const statusLabel: Record<string, string> = {
    RECEIVED: "Received", MATCHED: "Matched", DRAFT: "Draft", LINKED: "Linked", ARCHIVED: "Archived",
  };

  return (
    <div className="pt-4 pb-8 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            {showTrash ? "Trash" : "Intake Forms"}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            {showTrash
              ? "Deleted forms — restore or permanently delete"
              : "Patient intake forms received from HIPPAtizer"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800">
            <FileText className="h-3 w-3 mr-1" />
            {pagination?.total || 0} {showTrash ? "in trash" : "forms"}
          </Badge>
          <Button
            variant={showTrash ? "default" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => { setShowTrash((v) => !v); setCurrentPage(1); setSelectedIds(new Set()); setSelectedFormType("all"); }}
          >
            <Trash className="h-4 w-4" />
            {showTrash ? "Back to Forms" : "Trash"}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by patient name..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              />
            </div>
            <Select value={selectedFormType} onValueChange={(v) => { setSelectedFormType(v ?? "all"); setCurrentPage(1); }}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="All Form Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Form Types</SelectItem>
                <SelectItem value="NEW PATIENT PRE-REGISTRATION">New Patient Pre-Registration</SelectItem>
                <SelectItem value="KiDS PATIENT INTAKE FORM">KiDS Patient Intake Form</SelectItem>
                <SelectItem value="DIAGNOSTIC INTERVIEW">Diagnostic Interview</SelectItem>
                <SelectItem value="SENSORY ASSESSMENT - PARENT/CAREGIVER">Sensory Assessment – Parent</SelectItem>
                <SelectItem value="SENSORY ASSESSMENT - ADOLESCENT">Sensory Assessment – Adolescent</SelectItem>
                <SelectItem value="SENSORY ASSESSMENT - TEACHER">Sensory Assessment – Teacher</SelectItem>
                <SelectItem value="PREVIEW INTERVIEW QUESTION">Preview Interview Question</SelectItem>
              </SelectContent>
            </Select>
            {!showTrash && (
              <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v ?? "all"); setCurrentPage(1); }}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="RECEIVED">Received</SelectItem>
                  <SelectItem value="MATCHED">Matched</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="LINKED">Linked</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bulk action toolbar */}
      {someSelected && (
        <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg">
          <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
            {selectedIds.size} selected
          </span>
          <div className="flex gap-2 ml-auto">
            {showTrash ? (
              <>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => handleRestore(Array.from(selectedIds))} disabled={actionLoading}>
                  <RotateCcw className="h-3 w-3" />Restore
                </Button>
                <Button size="sm" variant="destructive" className="gap-1" onClick={openBulkDeleteDialog} disabled={actionLoading}>
                  <Trash2 className="h-3 w-3" />Delete Permanently
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" className="gap-1" onClick={handleBulkArchive} disabled={actionLoading}>
                  Archive
                </Button>
                <Button size="sm" variant="outline" className="gap-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={openBulkDeleteDialog} disabled={actionLoading}>
                  <Trash2 className="h-3 w-3" />Move to Trash
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : forms.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
              <p className="text-slate-500 dark:text-slate-400">
                {showTrash ? "Trash is empty" : "No intake forms found"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="rounded accent-blue-600 cursor-pointer"
                      />
                    </TableHead>
                    <TableHead>Form Title</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forms.map((form) => (
                    <TableRow key={form.id} className={selectedIds.has(form.id) ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(form.id)}
                          onChange={() => toggleOne(form.id)}
                          className="rounded accent-blue-600 cursor-pointer"
                        />
                      </TableCell>
                      <TableCell className="font-medium max-w-[180px] truncate">
                        {form.hippatizFormTitle}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500 dark:text-slate-400">
                        {new Date(form.submittedAt).toLocaleDateString()}
                        <br />
                        <span className="text-xs">{new Date(form.submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </TableCell>
                      <TableCell>
                        {form.linkedPatientName ? (
                          <div className="text-sm"><p className="font-medium">{form.linkedPatientName}</p><p className="text-xs text-slate-500">Linked</p></div>
                        ) : form.draftPatientName ? (
                          <div className="text-sm"><p className="font-medium">{form.draftPatientName}</p><p className="text-xs text-slate-500">Draft</p></div>
                        ) : (
                          <p className="text-sm text-slate-500">Unmatched</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColor[form.status] || "bg-slate-100 text-slate-800"}>
                          {statusLabel[form.status] || form.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {form.matchConfidence ? (
                          <div className="flex items-center gap-1">
                            <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${form.matchConfidence * 100}%` }} />
                            </div>
                            <span className="text-xs font-medium">{Math.round(form.matchConfidence * 100)}%</span>
                          </div>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {showTrash ? (
                            <>
                              <Button variant="ghost" size="sm" title="Restore" onClick={() => handleRestore([form.id])} className="text-slate-600 dark:text-slate-400">
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" title="Delete permanently" onClick={() => openDeleteDialog(form)} className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              {/* Eye — view in HIPPAtizer if link exists, else detail page */}
                              {form.hippatizViewLink ? (
                                <a href={form.hippatizViewLink} target="_blank" rel="noopener noreferrer" className="inline-flex">
                                  <Button variant="ghost" size="sm" title="View in HIPPAtizer" className="text-slate-600 dark:text-slate-400">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </a>
                              ) : (
                                <Button variant="ghost" size="sm" title="View details" onClick={() => router.push(`/intake-forms/${form.id}`)} className="text-slate-600 dark:text-slate-400">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}

                              {/* Assign — for RECEIVED (unmatched) and MATCHED (re-assign) */}
                              {(form.status === "RECEIVED" || form.status === "MATCHED") && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title={form.status === "MATCHED" ? "Re-assign patient" : "Assign to patient"}
                                  className="text-slate-600 dark:text-slate-400"
                                  onClick={() => openAssignModal(form)}
                                >
                                  <UserPlus className="h-4 w-4" />
                                </Button>
                              )}

                              {/* Download — HIPPAtizer PDF if exists */}
                              {form.hippatizPdfLink ? (
                                <a href={form.hippatizPdfLink} target="_blank" rel="noopener noreferrer" className="inline-flex">
                                  <Button variant="ghost" size="sm" title="Download PDF from HIPPAtizer" className="text-slate-600 dark:text-slate-400">
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </a>
                              ) : (
                                <Button variant="ghost" size="sm" title="No PDF available" disabled className="text-slate-300 dark:text-slate-600">
                                  <Download className="h-4 w-4" />
                                </Button>
                              )}

                              {/* Quick overview */}
                              <Button variant="ghost" size="sm" title="Quick overview" onClick={() => openOverview(form)} className="text-slate-600 dark:text-slate-400">
                                <ScanEye className="h-4 w-4" />
                              </Button>

                              {/* Trash */}
                              <Button variant="ghost" size="sm" title="Move to trash" onClick={() => openDeleteDialog(form)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Showing {(currentPage - 1) * pagination.limit + 1}–{Math.min(currentPage * pagination.limit, pagination.total)} of {pagination.total}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-slate-600 dark:text-slate-400">{currentPage} / {pagination.totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={currentPage === pagination.totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete {deleteDialog.open ? deleteDialog.label : ""}
            </DialogTitle>
            <DialogDescription>
              Choose how you want to remove this form.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Button
              className="w-full gap-2 justify-start"
              variant="outline"
              disabled={actionLoading}
              onClick={() => deleteDialog.open && handleTrash(deleteDialog.ids)}
            >
              <Trash className="h-4 w-4 text-slate-500" />
              <div className="text-left">
                <p className="font-medium text-sm">Move to Trash</p>
                <p className="text-xs text-slate-500">Hidden from view — can be restored later</p>
              </div>
            </Button>
            <Button
              className="w-full gap-2 justify-start"
              variant="destructive"
              disabled={actionLoading}
              onClick={() => deleteDialog.open && handlePermanentDelete(deleteDialog.ids)}
            >
              <Trash2 className="h-4 w-4" />
              <div className="text-left">
                <p className="font-medium text-sm">Delete Permanently</p>
                <p className="text-xs opacity-80">Cannot be undone</p>
              </div>
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setDeleteDialog({ open: false })} disabled={actionLoading}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick overview modal */}
      <Dialog open={!!overviewForm} onOpenChange={(open) => !open && setOverviewForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanEye className="h-5 w-5 text-blue-500" />
              {overviewForm?.hippatizFormTitle}
            </DialogTitle>
            <DialogDescription>
              Submitted {overviewForm ? new Date(overviewForm.submittedAt).toLocaleDateString() : ""}
            </DialogDescription>
          </DialogHeader>
          {overviewLoading ? (
            <div className="flex justify-center py-6"><Loader className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : overviewFields.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">No key fields available for this form.</p>
          ) : (
            <div className="space-y-0 max-h-80 overflow-y-auto">
              {overviewFields.map((f, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-1 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <span className="text-xs font-medium text-slate-500 sm:w-44 shrink-0">{f.fieldLabel}</span>
                  <span className="text-sm text-slate-900 dark:text-slate-100">{f.value}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            {overviewForm && (
              <Button size="sm" variant="outline" className="flex-1" onClick={() => { router.push(`/intake-forms/${overviewForm.id}`); setOverviewForm(null); }}>
                View Full Form
              </Button>
            )}
            <Button size="sm" variant="ghost" className="flex-1" onClick={() => setOverviewForm(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign-patient modal */}
      <Dialog open={showMatchModal} onOpenChange={(open) => !open && closeAssignModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-blue-500" />
              Assign to Patient
            </DialogTitle>
            <DialogDescription className="truncate text-xs">
              {selectedForm?.hippatizFormTitle}
            </DialogDescription>
          </DialogHeader>

          {assignSuccess ? (
            <div className="flex flex-col items-center gap-3 py-6 text-green-700 dark:text-green-400">
              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Loader className="h-5 w-5 text-green-600" />
              </div>
              <p className="font-medium text-sm">Assigned successfully</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by patient name..."
                  className="pl-10"
                  value={assignSearch}
                  onChange={(e) => setAssignSearch(e.target.value)}
                  autoFocus
                />
                {assignSearching && (
                  <Loader className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
                )}
              </div>

              {/* Results */}
              {assignSearch.length >= 2 && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                  {assignResults.length === 0 && !assignSearching ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
                      No active patients found
                    </p>
                  ) : (
                    assignResults.map((p) => (
                      <button
                        key={p.id}
                        disabled={assignLoading}
                        onClick={() => handleAssignPatient(p)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-blue-50 dark:hover:bg-blue-950/30 border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors disabled:opacity-50"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {p.firstName} {p.lastName}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            DOB: {p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString() : "—"}
                          </p>
                        </div>
                        {assignLoading ? (
                          <Loader className="h-4 w-4 animate-spin text-slate-400" />
                        ) : (
                          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0 text-xs">
                            Assign
                          </Badge>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}

              {assignSearch.length < 2 && (
                <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-2">
                  Type at least 2 characters to search
                </p>
              )}

              {assignError && (
                <p className="text-xs text-red-600 dark:text-red-400 text-center">{assignError}</p>
              )}

              <Button variant="ghost" className="w-full" onClick={closeAssignModal} disabled={assignLoading}>
                Cancel
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
