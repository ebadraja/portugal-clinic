"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { LoadState, SectionCard, inputCls, useJson } from "@/components/settings/shared";

type Usage = {
  month: string;
  calls: number;
  minutes: number;
  averageCallSeconds: number | null;
  byOutcome: Record<string, number>;
  webConversations: number;
  appointmentsBookedByVoice: number;
  callbackRequests: number;
};

const OUTCOME_LABEL: Record<string, string> = { BOOKED: "Booked / rescheduled", INFO_PROVIDED: "Information / callback", TRANSFERRED: "Transferred", HUNG_UP: "Hung up / short", VOICEMAIL: "Voicemail", IN_PROGRESS: "Unfinished" };

export function UsageTab() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const { data, loading, error, reload: retry } = useJson<Usage>(`/api/settings/usage?month=${month}`, { forbiddenMessage: "Only administrators can see usage." });

  return (
    <div className="space-y-6">
      <SectionCard
        title="Voice agent usage"
        description="Counted from the CRM's own call log. Provider invoices (Vapi, telephony) are billed by those providers and are not shown here."
        actions={<Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={`h-9 w-44 ${inputCls}`} aria-label="Month" />}
      >
        {!data ? (
          <LoadState loading={loading} error={error} onRetry={retry} />
        ) : data.calls === 0 && data.webConversations === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">No calls or web conversations were recorded in {data.month}.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                ["Calls", data.calls.toLocaleString("pt-PT")],
                ["Minutes", data.minutes.toLocaleString("pt-PT")],
                ["Avg. call", data.averageCallSeconds === null ? "—" : `${Math.floor(data.averageCallSeconds / 60)}m ${data.averageCallSeconds % 60}s`],
                ["Booked by voice", String(data.appointmentsBookedByVoice)],
                ["Callback requests", String(data.callbackRequests)],
                ["Web conversations", String(data.webConversations)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{k}</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">{v}</p>
                </div>
              ))}
            </div>
            {Object.keys(data.byOutcome).length > 0 && (
              <ul className="text-sm divide-y divide-slate-100 dark:divide-slate-800">
                {Object.entries(data.byOutcome).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <li key={k} className="flex justify-between py-2"><span className="text-slate-700 dark:text-slate-300">{OUTCOME_LABEL[k] ?? k}</span><span className="font-medium text-slate-900 dark:text-slate-100">{v}</span></li>
                ))}
              </ul>
            )}
          </>
        )}
      </SectionCard>
    </div>
  );
}
