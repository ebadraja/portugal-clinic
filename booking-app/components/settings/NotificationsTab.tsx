"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast-provider";
import { LoadState, ReadOnlyNotice, SectionCard, StatusIcon, hintCls, inputCls, labelCls, sendJson, useIsAdmin, useJson } from "@/components/settings/shared";
import { useDraft } from "@/components/settings/use-clinic-settings";

type Prefs = {
  notificationEmail: string;
  emailEnabled: boolean;
  emailNewBooking: boolean;
  emailCancellation: boolean;
  emailEscalation: boolean;
  emailNewPatient: boolean;
  deliveryConfigured: boolean;
};

const TOGGLES: { key: keyof Prefs; label: string; hint: string }[] = [
  { key: "emailNewBooking", label: "Appointment booked by the voice agent", hint: "Patient first name and time." },
  { key: "emailCancellation", label: "Appointment cancelled by the voice agent", hint: "Flags cancellations inside the notice window." },
  { key: "emailEscalation", label: "Urgent callback or call transferred to staff", hint: "Sent immediately." },
  { key: "emailNewPatient", label: "New patient asked to be called back", hint: "So capacity can be checked quickly." },
];

export function NotificationsTab() {
  const isAdmin = useIsAdmin();
  const { showToast } = useToast();
  const { data: prefs, loading, error, reload: retry, setData: setPrefs } = useJson<Prefs>("/api/settings/notifications");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [draft, setDraft, dirty] = useDraft(prefs ?? undefined);

  if (!prefs || !draft) return <LoadState loading={loading} error={error} onRetry={retry} />;

  const save = async () => {
    setSaving(true);
    try {
      const { deliveryConfigured: _ignored, ...body } = draft;
      void _ignored;
      setPrefs(await sendJson<Prefs>("/api/settings/notifications", "PATCH", body));
      showToast("Saved", "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      await sendJson("/api/settings/notifications", "POST");
      showToast(`Test email sent to ${prefs.notificationEmail}`, "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {!isAdmin && <ReadOnlyNotice />}
      <SectionCard
        title="Email alerts to the clinic"
        description="In-app notifications always appear in the bell. These emails are for what the voice agent does while nobody is watching the CRM."
        onSave={save}
        saving={saving}
        dirty={dirty}
        canEdit={isAdmin}
        actions={
          isAdmin && prefs.notificationEmail ? (
            <Button size="sm" variant="outline" onClick={test} disabled={testing || dirty} className="gap-1.5">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send test
            </Button>
          ) : undefined
        }
      >
        {!prefs.deliveryConfigured && (
          <div className="flex items-start gap-2 text-sm rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3 text-amber-800 dark:text-amber-300">
            <StatusIcon status="warn" />No email provider is configured, so alerts cannot be sent yet. Connect Gmail in the Email tab.
          </div>
        )}
        <div className="max-w-md">
          <label className={labelCls}>Send alerts to</label>
          <Input type="email" value={draft.notificationEmail} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, notificationEmail: e.target.value })} placeholder="geral@clinicadentariaih.com" className={inputCls} />
          <p className={hintCls}>A clinic mailbox, not a personal one. Alerts contain first names and times only.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
          <input type="checkbox" checked={draft.emailEnabled} disabled={!isAdmin} onChange={(e) => setDraft({ ...draft, emailEnabled: e.target.checked })} className="rounded accent-blue-600" />
          Email alerts enabled
        </label>
        <div className={`space-y-3 pl-6 ${draft.emailEnabled ? "" : "opacity-50"}`}>
          {TOGGLES.map((t) => (
            <label key={t.key} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={draft[t.key] as boolean} disabled={!isAdmin || !draft.emailEnabled} onChange={(e) => setDraft({ ...draft, [t.key]: e.target.checked })} className="rounded accent-blue-600 mt-0.5" />
              <span>{t.label}<span className="block text-xs text-slate-500">{t.hint}</span></span>
            </label>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
