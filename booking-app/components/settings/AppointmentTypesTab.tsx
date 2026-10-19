"use client";

import { Input } from "@/components/ui/input";
import { LoadState, ReadOnlyNotice, SectionCard, inputCls, useIsAdmin } from "@/components/settings/shared";
import { useClinicSettings, useDraft } from "@/components/settings/use-clinic-settings";
import type { AppointmentTypeConfig } from "@/components/settings/clinic-types";

export function AppointmentTypesTab() {
  const { data, loading, error, reload, save, savingSection } = useClinicSettings();
  const isAdmin = useIsAdmin();
  const [draft, setDraft, dirty] = useDraft(data?.appointmentTypes);

  if (!data || !draft) return <LoadState loading={loading} error={error} onRetry={reload} />;

  const set = (type: string, patch: Partial<AppointmentTypeConfig>) => setDraft(draft.map((t) => (t.type === type ? { ...t, ...patch } : t)));

  return (
    <div className="space-y-6">
      {!isAdmin && <ReadOnlyNotice />}
      <SectionCard
        title="Appointment types"
        description={
          <>
            Duration sets the slot length; buffer keeps time free after the visit. <strong>Agent can book</strong> lets Acácia book that type for verified
            existing patients — everything else is booked by the team (the agent takes a callback instead).
          </>
        }
        onSave={() => save("types", { appointmentTypes: draft })}
        saving={savingSection === "types"}
        dirty={dirty}
        canEdit={isAdmin}
      >
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-2 px-2">Name</th>
                <th className="py-2 px-2 w-24">Minutes</th>
                <th className="py-2 px-2 w-24">Buffer</th>
                <th className="py-2 px-2 w-28">From (€)</th>
                <th className="py-2 px-2 w-16">Colour</th>
                <th className="py-2 px-2 w-28 text-center">Agent can book</th>
                <th className="py-2 px-2 w-20 text-center">Active</th>
              </tr>
            </thead>
            <tbody>
              {draft.map((t) => (
                <tr key={t.type} className={`border-b border-slate-100 dark:border-slate-800 ${t.active ? "" : "opacity-60"}`}>
                  <td className="py-2 px-2">
                    <Input value={t.label} disabled={!isAdmin} onChange={(e) => set(t.type, { label: e.target.value })} className={`h-8 ${inputCls}`} aria-label={`${t.type} name`} />
                    <span className="text-[11px] text-slate-400 font-mono">{t.type}</span>
                  </td>
                  <td className="py-2 px-2"><Input type="number" min={5} max={480} step={5} value={t.durationMinutes} disabled={!isAdmin} onChange={(e) => set(t.type, { durationMinutes: Number(e.target.value) })} className={`h-8 ${inputCls}`} aria-label={`${t.label} minutes`} /></td>
                  <td className="py-2 px-2"><Input type="number" min={0} max={120} step={5} value={t.bufferMinutes} disabled={!isAdmin} onChange={(e) => set(t.type, { bufferMinutes: Number(e.target.value) })} className={`h-8 ${inputCls}`} aria-label={`${t.label} buffer`} /></td>
                  <td className="py-2 px-2">
                    <Input type="number" min={0} step={1} value={t.priceFromEur ?? ""} placeholder="—" disabled={!isAdmin} onChange={(e) => set(t.type, { priceFromEur: e.target.value === "" ? null : Number(e.target.value) })} className={`h-8 ${inputCls}`} aria-label={`${t.label} price from`} />
                  </td>
                  <td className="py-2 px-2"><input type="color" value={t.color} disabled={!isAdmin} onChange={(e) => set(t.type, { color: e.target.value })} className="h-8 w-10 rounded border border-slate-300 dark:border-slate-600" aria-label={`${t.label} colour`} /></td>
                  <td className="py-2 px-2 text-center"><input type="checkbox" checked={t.agentBookable} disabled={!isAdmin || !t.active} onChange={(e) => set(t.type, { agentBookable: e.target.checked })} className="rounded accent-blue-600" aria-label={`${t.label} bookable by agent`} /></td>
                  <td className="py-2 px-2 text-center"><input type="checkbox" checked={t.active} disabled={!isAdmin} onChange={(e) => set(t.type, { active: e.target.checked, ...(e.target.checked ? {} : { agentBookable: false }) })} className="rounded accent-blue-600" aria-label={`${t.label} active`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Prices are &quot;a partir de&quot; (from) values, per ERS advertising rules. Emergencies are not agent-bookable by default so the team can triage.</p>
      </SectionCard>
    </div>
  );
}
