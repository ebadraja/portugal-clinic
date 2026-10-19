"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadState, SectionCard, StatusIcon, useJson } from "@/components/settings/shared";

type Check = { id: string; area: string; label: string; status: "ok" | "warn" | "fail" | "info"; detail: string };
type Integration = { name: string; service: string; connected: boolean; detail: string; tab: string | null };
export type StatusPayload = { checks: Check[]; integrations: Integration[]; generatedAt: string };

export function useSystemStatus() {
  const { data, loading, error, reload } = useJson<StatusPayload>("/api/settings/status", { forbiddenMessage: "Only administrators can see system status." });
  return { data, loading, error, load: reload };
}

const ORDER: Record<Check["status"], number> = { fail: 0, warn: 1, info: 2, ok: 3 };

export function ChecksList({ checks }: { checks: Check[] }) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {[...checks].sort((a, b) => ORDER[a.status] - ORDER[b.status]).map((c) => (
        <li key={c.id} className="py-3 flex items-start gap-3">
          <StatusIcon status={c.status} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{c.area} · {c.label}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{c.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SystemStatusTab({ onOpenTab }: { onOpenTab: (tab: string) => void }) {
  const { data, loading, error, load } = useSystemStatus();
  if (!data) return <LoadState loading={loading} error={error} onRetry={load} />;
  const problems = data.checks.filter((c) => c.status === "fail").length;
  const warnings = data.checks.filter((c) => c.status === "warn").length;
  return (
    <div className="space-y-6">
      <SectionCard
        title="System status"
        description={problems + warnings === 0 ? "Everything the clinic relies on is working." : `${problems} problem(s) and ${warnings} warning(s) need attention.`}
        actions={<Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>}
      >
        <ChecksList checks={data.checks} />
        <p className="text-xs text-slate-400">Checked {new Date(data.generatedAt).toLocaleString("pt-PT")}</p>
      </SectionCard>
      <IntegrationsGrid integrations={data.integrations} onOpenTab={onOpenTab} />
    </div>
  );
}

export function IntegrationsGrid({ integrations, onOpenTab }: { integrations: Integration[]; onOpenTab: (tab: string) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {integrations.map((i) => (
        <div key={i.name} className={`bg-white dark:bg-slate-900 rounded-xl border p-5 shadow-sm ${i.connected ? "border-green-200 dark:border-green-800/60" : "border-slate-200 dark:border-slate-700"}`}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">{i.name}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{i.service}</p>
            </div>
            <span className={`text-xs font-medium px-2.5 py-0.5 rounded-md ${i.connected ? "bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300" : "bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300"}`}>
              {i.connected ? "Connected" : "Not connected"}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{i.detail}</p>
          {i.tab ? (
            <Button variant="outline" size="sm" onClick={() => onOpenTab(i.tab!)}>Configure</Button>
          ) : (
            <p className="text-xs text-slate-400">Configured with server environment variables.</p>
          )}
        </div>
      ))}
    </div>
  );
}
