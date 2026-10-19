"use client";

import { useCallback, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadState, SectionCard, StatusIcon, inputCls, selectCls, useJson } from "@/components/settings/shared";
import { ChecksList, useSystemStatus } from "@/components/settings/SystemStatusTab";
import { SignInSecurity } from "@/components/settings/SignInSecurity";

type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  timestamp: string;
  ipAddress: string | null;
  changes: unknown;
  user: { firstName: string; lastName: string; email: string } | null;
};

const ACTIONS = ["", "CREATE", "READ", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "MESSAGE_SENT", "PORTAL_ACCESS"];
const ENTITIES = ["", "patient", "appointment", "call_log", "call_recording", "callback_request", "settings", "user", "auth", "knowledge_item", "audit_log"];

export function SecurityAuditTab() {
  const status = useSystemStatus();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ action: "", entity: "", from: "", to: "" });

  const query = useCallback(
    (extra: Record<string, string> = {}) => new URLSearchParams(Object.fromEntries(Object.entries({ ...filters, ...extra }).filter(([, v]) => v))).toString(),
    [filters],
  );

  const audit = useJson<{ data: AuditRow[]; pagination: { total: number; totalPages: number } }>(
    `/api/audit-logs?${query({ page: String(page), limit: "25" })}`,
    { forbiddenMessage: "Only administrators can read the audit log." },
  );
  const rows = audit.data?.data ?? [];
  const total = audit.data?.pagination.total ?? 0;
  const totalPages = Math.max(1, audit.data?.pagination.totalPages ?? 1);
  const { loading, error, reload: retry } = audit;

  const securityChecks = status.data?.checks.filter((c) => c.area === "Security" || c.id === "vapi_secret") ?? [];

  return (
    <div className="space-y-6">
      <SignInSecurity />
      <SectionCard title="Security checks" description="Live configuration checks — nothing here is a static badge.">
        {status.data ? <ChecksList checks={securityChecks} /> : <LoadState loading={status.loading} error={status.error} onRetry={status.load} />}
        <ul className="space-y-2 text-sm pt-2 border-t border-slate-100 dark:border-slate-800">
          <li className="flex items-start gap-2"><StatusIcon status="ok" /><span className="text-slate-700 dark:text-slate-300">Every staff API checks the session itself; reads of patient records and recordings are written to the audit log.</span></li>
          <li className="flex items-start gap-2"><StatusIcon status="ok" /><span className="text-slate-700 dark:text-slate-300">Call recordings are streamed through the CRM — provider links never reach the browser.</span></li>
          <li className="flex items-start gap-2"><StatusIcon status="ok" /><span className="text-slate-700 dark:text-slate-300">Staff choose their own password via one-time links (no shared default password).</span></li>
        </ul>
      </SectionCard>

      <SectionCard
        title="Audit log"
        description={`Read-only and never purged automatically. ${total.toLocaleString("pt-PT")} entries match.`}
        actions={
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { window.location.href = `/api/audit-logs?${query({ format: "csv" })}`; }}>
            <Download className="h-4 w-4" />Export CSV
          </Button>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select aria-label="Action" value={filters.action} onChange={(e) => { setPage(1); setFilters({ ...filters, action: e.target.value }); }} className={selectCls}>
            {ACTIONS.map((a) => <option key={a} value={a}>{a || "All actions"}</option>)}
          </select>
          <select aria-label="Record type" value={filters.entity} onChange={(e) => { setPage(1); setFilters({ ...filters, entity: e.target.value }); }} className={selectCls}>
            {ENTITIES.map((a) => <option key={a} value={a}>{a || "All records"}</option>)}
          </select>
          <Input aria-label="From" type="date" value={filters.from} onChange={(e) => { setPage(1); setFilters({ ...filters, from: e.target.value }); }} className={`h-9 ${inputCls}`} />
          <Input aria-label="To" type="date" value={filters.to} onChange={(e) => { setPage(1); setFilters({ ...filters, to: e.target.value }); }} className={`h-9 ${inputCls}`} />
        </div>
        {error ? (
          <LoadState loading={false} error={error} onRetry={retry} />
        ) : loading && rows.length === 0 ? (
          <LoadState loading error={null} onRetry={retry} />
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">No audit entries match these filters.</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 px-2">When</th><th className="py-2 px-2">Who</th><th className="py-2 px-2">Action</th><th className="py-2 px-2">Record</th><th className="py-2 px-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 align-top">
                    <td className="py-2 px-2 whitespace-nowrap text-slate-600 dark:text-slate-400">{new Date(r.timestamp).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="py-2 px-2 text-slate-900 dark:text-slate-100">{r.user ? `${r.user.firstName} ${r.user.lastName}` : <span className="text-slate-500">System</span>}</td>
                    <td className="py-2 px-2"><span className="font-mono text-xs">{r.action}</span></td>
                    <td className="py-2 px-2 text-slate-700 dark:text-slate-300">{r.entity}{r.entityId ? <span className="block font-mono text-[11px] text-slate-400 truncate max-w-[10rem]">{r.entityId}</span> : null}</td>
                    <td className="py-2 px-2 text-xs text-slate-500 max-w-xs truncate" title={r.changes ? JSON.stringify(r.changes) : ""}>{r.changes ? JSON.stringify(r.changes) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 text-sm text-slate-600 dark:text-slate-400">
          <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
          <span>Page {page} of {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </SectionCard>
    </div>
  );
}
