"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { AlertTriangle, CheckCircle2, Loader2, Phone, PhoneCall, Plus, RefreshCw, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/toast-provider";

type Person = { id: string; firstName: string; lastName: string };
type Callback = {
  id: string;
  callerName: string;
  phone: string;
  reason: string;
  urgency: "LOW" | "NORMAL" | "URGENT";
  isNewPatient: boolean;
  source: string;
  status: "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  patient: Person | null;
  assignedTo: Person | null;
  dueAt: string | null;
  resolutionNote: string | null;
  completedAt: string | null;
  createdAt: string;
};

const selectCls =
  "h-9 px-3 border border-slate-300 dark:border-slate-600 rounded-md text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const SOURCE_LABEL: Record<string, string> = { VOICE_AGENT: "Voice agent", STAFF: "Staff", CHATBOT: "Chatbot", WEBSITE: "Website", WALK_IN: "Walk-in" };
const STATUS_LABEL: Record<Callback["status"], string> = { OPEN: "Open", IN_PROGRESS: "In progress", DONE: "Done", CANCELLED: "Cancelled" };

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
}

function formatPhone(e164: string): string {
  const m = /^\+351(\d{3})(\d{3})(\d{3})$/.exec(e164);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : e164;
}

export default function CallbacksPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const [rows, setRows] = useState<Callback[]>([]);
  const [counts, setCounts] = useState({ open: 0, urgent: 0 });
  const [staff, setStaff] = useState<Person[]>([]);
  const [status, setStatus] = useState<"open" | "done" | "all">("open");
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [closing, setClosing] = useState<Callback | null>(null);
  const [closeNote, setCloseNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ callerName: "", phone: "", reason: "", urgency: "NORMAL", isNewPatient: false });
  const canWrite = session?.user?.role !== "VIEWER";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ status, ...(mine && { mine: "true" }), ...(search.trim() && { search: search.trim() }) });
      const res = await fetch(`/api/callbacks?${qs}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to load callbacks");
      const data = await res.json();
      setRows(data.data);
      setCounts(data.counts);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status, mine, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  useEffect(() => {
    fetch("/api/callbacks/assignees")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setStaff(d.data ?? []))
      .catch(() => setStaff([]));
  }, []);

  const patch = async (cb: Callback, body: Record<string, unknown>, okMsg: string) => {
    setBusyId(cb.id);
    try {
      const res = await fetch(`/api/callbacks/${cb.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error ?? "Update failed", "error");
        return false;
      }
      showToast(okMsg, "success");
      await load();
      return true;
    } finally {
      setBusyId(null);
    }
  };

  const submitClose = async () => {
    if (!closing) return;
    const ok = await patch(closing, { status: "DONE", resolutionNote: closeNote.trim() }, "Callback closed");
    if (ok) {
      setClosing(null);
      setCloseNote("");
    }
  };

  const submitAdd = async () => {
    const res = await fetch("/api/callbacks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error ?? "Could not add callback", "error");
      return;
    }
    showToast("Callback added", "success");
    setAdding(false);
    setDraft({ callerName: "", phone: "", reason: "", urgency: "NORMAL", isNewPatient: false });
    load();
  };

  return (
    <div className="pt-4 pb-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Callbacks</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            People waiting for the clinic to call back — new patients, urgent cases and requests the voice agent could not complete.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
          </Button>
          {canWrite && (
            <Button size="sm" onClick={() => setAdding(true)} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4" />Add callback
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Open</p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-slate-50">{counts.open}</p>
        </div>
        <div className={`rounded-xl border p-4 ${counts.urgent > 0 ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"}`}>
          <p className="text-xs text-slate-500 dark:text-slate-400">Urgent</p>
          <p className={`text-2xl font-semibold ${counts.urgent > 0 ? "text-red-700 dark:text-red-300" : "text-slate-900 dark:text-slate-50"}`}>{counts.urgent}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={selectCls} aria-label="Status">
          <option value="open">Open</option>
          <option value="done">Done / cancelled</option>
          <option value="all">All</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="rounded accent-blue-600" />
          Assigned to me
        </label>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone or reason" className="pl-8 h-9" />
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={load}>Try again</Button>
        </div>
      ) : loading && rows.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-10 justify-center"><Loader2 className="h-4 w-4 animate-spin" />Loading callbacks…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
          <p className="font-medium text-slate-900 dark:text-slate-100">{status === "open" ? "Nobody is waiting for a call back." : "No callbacks match these filters."}</p>
          <p className="text-sm text-slate-500 mt-1">Requests taken by the voice agent appear here automatically.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((cb) => {
            const open = cb.status === "OPEN" || cb.status === "IN_PROGRESS";
            return (
              <li key={cb.id} className={`rounded-xl border bg-white dark:bg-slate-900 p-4 ${cb.urgency === "URGENT" && open ? "border-red-300 dark:border-red-800" : "border-slate-200 dark:border-slate-700"}`}>
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {cb.urgency === "URGENT" && <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-0 gap-1"><AlertTriangle className="h-3 w-3" />Urgent</Badge>}
                      {cb.isNewPatient && <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-0 gap-1"><UserPlus className="h-3 w-3" />New patient</Badge>}
                      <Badge variant="outline">{STATUS_LABEL[cb.status]}</Badge>
                      <span className="text-xs text-slate-500">{SOURCE_LABEL[cb.source] ?? cb.source} · {ago(cb.createdAt)}</span>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-semibold text-slate-900 dark:text-slate-50">{cb.callerName}</span>
                      <a href={`tel:${cb.phone}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" />{formatPhone(cb.phone)}
                      </a>
                      {cb.patient && (
                        <Link href={`/patients/${cb.patient.id}`} className="text-sm text-slate-600 dark:text-slate-300 hover:underline">
                          Patient record: {cb.patient.firstName} {cb.patient.lastName}
                        </Link>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{cb.reason}</p>
                    {cb.resolutionNote && (
                      <p className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 rounded-md px-3 py-2">
                        <span className="font-medium">Outcome:</span> {cb.resolutionNote}
                      </p>
                    )}
                  </div>
                  {open && canWrite && (
                    <div className="flex flex-col sm:flex-row lg:flex-col gap-2 lg:w-56">
                      <select
                        value={cb.assignedTo?.id ?? ""}
                        disabled={busyId === cb.id}
                        onChange={(e) => patch(cb, { assignedToId: e.target.value || null }, e.target.value ? "Assigned" : "Unassigned")}
                        className={`${selectCls} w-full`}
                        aria-label="Assigned to"
                      >
                        <option value="">Unassigned</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
                        ))}
                      </select>
                      {cb.status === "OPEN" && (
                        <Button size="sm" variant="outline" disabled={busyId === cb.id} className="gap-1.5"
                          onClick={() => patch(cb, { status: "IN_PROGRESS", ...(!cb.assignedTo && session?.user?.id && { assignedToId: session.user.id }) }, "Marked in progress")}>
                          <PhoneCall className="h-4 w-4" />Calling now
                        </Button>
                      )}
                      <Button size="sm" disabled={busyId === cb.id} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setClosing(cb); setCloseNote(""); }}>
                        <CheckCircle2 className="h-4 w-4" />Close
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!closing} onOpenChange={(o) => { if (!o) setClosing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Close callback — {closing?.callerName}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-900 dark:text-slate-100">What happened?</label>
            <Textarea value={closeNote} onChange={(e) => setCloseNote(e.target.value)} placeholder="e.g. Booked evaluation for 21/10 at 10:00 / No answer twice, left voicemail / Not a patient need" rows={3} />
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => closing && patch(closing, { status: "CANCELLED", resolutionNote: closeNote.trim() || "Cancelled" }, "Callback cancelled").then((ok) => ok && setClosing(null))}>
                Cancel request
              </Button>
              <Button onClick={submitClose} disabled={!closeNote.trim() || busyId === closing?.id} className="bg-emerald-600 hover:bg-emerald-700">Close as done</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add callback</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Name" value={draft.callerName} onChange={(e) => setDraft({ ...draft, callerName: e.target.value })} />
            <Input placeholder="Phone (e.g. 912 345 678)" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            <Textarea placeholder="Reason" rows={3} value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} />
            <div className="flex flex-wrap gap-4 items-center">
              <select value={draft.urgency} onChange={(e) => setDraft({ ...draft, urgency: e.target.value })} className={selectCls} aria-label="Urgency">
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="URGENT">Urgent</option>
              </select>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={draft.isNewPatient} onChange={(e) => setDraft({ ...draft, isNewPatient: e.target.checked })} className="rounded accent-blue-600" />
                New patient
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
              <Button onClick={submitAdd} disabled={!draft.callerName.trim() || !draft.phone.trim() || !draft.reason.trim()} className="bg-blue-600 hover:bg-blue-700">Add</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
