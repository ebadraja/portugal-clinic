"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Loader2, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadState, ReadOnlyNotice, SectionCard, hintCls, inputCls, labelCls, selectCls, useIsAdmin } from "@/components/settings/shared";
import { MERGE_TAGS, fillTemplate, plainCharacters, smsSegments } from "@/lib/appointments/smsText";

type Channel = "SMS" | "EMAIL";
type Kind = "CONFIRMATION" | "REMINDER_DAY_BEFORE" | "REMINDER_HOURS_BEFORE" | "RESCHEDULED" | "CANCELLED";
type Policy = {
  confirmation: { enabled: boolean; channels: Channel[] };
  dayBefore: { enabled: boolean; sendAt: string; channels: Channel[] };
  hoursBefore: { enabled: boolean; hours: number; channels: Channel[] };
  changeNotices: { rescheduled: boolean; cancelled: boolean; channels: Channel[] };
  quietHours: { start: string; end: string };
  smsPlainCharacters: boolean;
  smsTemplates: Record<Kind, string>;
};
type Snapshot = {
  flags: { agendaV2: boolean; reminders: boolean };
  reminderPolicy: Policy;
  defaults: { smsTemplates: Record<Kind, string> };
  practice: { name: string; phone: string; address: string };
  status: { dispatchHeartbeatAt: string | null; cronSecretConfigured: boolean; smsConfigured: boolean; pending: number; sent7d: number; failed7d: number };
};

const KIND_LABEL: Record<Kind, string> = {
  CONFIRMATION: "Booking confirmation",
  REMINDER_DAY_BEFORE: "Day-before reminder",
  REMINDER_HOURS_BEFORE: "Same-day reminder",
  RESCHEDULED: "Appointment moved",
  CANCELLED: "Appointment cancelled",
};

/** The cron runs at least daily (Vercel backstop), so older than ~a day means it stopped. */
function isRecent(d: Date | null, now = new Date()): boolean {
  return !!d && now.getTime() - d.getTime() < 26 * 3_600_000
}

function ChannelPicker({ value, onChange, disabled }: { value: Channel[]; onChange: (v: Channel[]) => void; disabled: boolean }) {
  return (
    <span className="inline-flex gap-3 text-sm text-slate-700 dark:text-slate-300">
      {(["SMS", "EMAIL"] as Channel[]).map((c) => (
        <label key={c} className="flex items-center gap-1.5">
          <input type="checkbox" className="rounded accent-blue-600" disabled={disabled} checked={value.includes(c)} onChange={(e) => onChange(e.target.checked ? [...value, c] : value.filter((x) => x !== c))} />
          {c === "SMS" ? "SMS" : "Email"}
        </label>
      ))}
    </span>
  );
}

export function AgendaRemindersTab() {
  const isAdmin = useIsAdmin();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [test, setTest] = useState<{ channel: Channel; to: string; kind: Kind }>({ channel: "SMS", to: "", kind: "REMINDER_DAY_BEFORE" });
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/agenda")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Failed to load");
        setSnap(d);
        setPolicy(d.reminderPolicy);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const dirty = useMemo(() => !!snap && !!policy && JSON.stringify(snap.reminderPolicy) !== JSON.stringify(policy), [snap, policy]);

  async function save(body: Record<string, unknown>, label: string) {
    setSaving(label);
    setNotice(null);
    try {
      const r = await fetch("/api/settings/agenda", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to save");
      setSnap(d);
      setPolicy(d.reminderPolicy);
      if (d.replanned) setNotice(`Reminders planned for ${d.replanned.appointments} upcoming appointment(s) (${d.replanned.messages} message(s)).`);
      else if (d.cancelled) setNotice(`${d.cancelled} pending message(s) cancelled.`);
      else setNotice("Saved.");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  async function sendTest() {
    setSaving("test");
    setTestResult(null);
    try {
      const r = await fetch("/api/settings/agenda/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(test) });
      const d = await r.json();
      setTestResult(d.ok ? "Sent — check your phone or inbox." : `Not sent: ${d.error ?? "unknown error"}`);
    } finally {
      setSaving(null);
    }
  }

  if (error) return <LoadState loading={false} error={error} onRetry={() => window.location.reload()} />;
  if (!snap || !policy) return <LoadState loading error={null} onRetry={() => window.location.reload()} />;
  const canEdit = isAdmin;
  const set = (patch: Partial<Policy>) => setPolicy({ ...policy, ...patch });
  const sample = {
    primeiro_nome: "Maria",
    data: "22/10",
    hora: "10:30",
    medico: "Dra. Ana Nunes",
    clinica: snap.practice.name,
    telefone_clinica: snap.practice.phone,
    morada: snap.practice.address,
    link: `${typeof window !== "undefined" ? window.location.origin : ""}/c/Ab3dE9kQ2xYz`,
  };
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const lastRun = snap.status.dispatchHeartbeatAt ? new Date(snap.status.dispatchHeartbeatAt) : null;

  return (
    <div className="space-y-6">
      {!canEdit && <ReadOnlyNotice />}

      <SectionCard title="Switches" description="Both are off until the clinic moves over from Zappy. Turn the agenda on first; turn reminders on when Zappy's reminders are off, so patients never get two.">
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">New agenda</p>
              <p className={hintCls}>Appointments page shows the calendar with a column per dentist, drag &amp; drop and the front-desk panel. Until then, anyone can preview it at <code>/appointments?agenda=1</code>.</p>
            </div>
            <Button size="sm" variant={snap.flags.agendaV2 ? "outline" : "default"} disabled={!canEdit || saving !== null} onClick={() => save({ agendaV2Enabled: !snap.flags.agendaV2 }, "agenda")}>
              {saving === "agenda" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {snap.flags.agendaV2 ? "On — switch off" : "Switch on"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">Patient confirmations &amp; reminders</p>
              <p className={hintCls}>Switching on plans reminders for every upcoming appointment. Switching off cancels everything not yet sent.</p>
            </div>
            <Button
              size="sm"
              variant={snap.flags.reminders ? "outline" : "default"}
              disabled={!canEdit || saving !== null}
              onClick={() => {
                if (!snap.flags.reminders && !window.confirm("Start sending confirmations and reminders to patients? Make sure Zappy's reminders are switched off first.")) return;
                void save({ remindersEnabled: !snap.flags.reminders }, "reminders");
              }}
            >
              {saving === "reminders" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {snap.flags.reminders ? "On — switch off" : "Switch on"}
            </Button>
          </div>
          {notice && <p role="status" className="text-sm text-slate-700 dark:text-slate-300">{notice}</p>}
        </div>
      </SectionCard>

      <SectionCard title="Sending health" description="Reminders are sent by a scheduled call to this CRM — no extra server needed.">
        <ul className="grid gap-2 text-sm">
          {[
            { ok: snap.status.cronSecretConfigured, text: snap.status.cronSecretConfigured ? "CRON_SECRET is configured." : "CRON_SECRET is not set on the server — nothing can be sent." },
            { ok: snap.status.smsConfigured, text: snap.status.smsConfigured ? "Twilio SMS is configured." : "Twilio is not configured — SMS can't be sent (email still works)." },
            { ok: isRecent(lastRun), text: lastRun ? `Dispatcher last ran ${lastRun.toLocaleString("en-GB")}.` : "The dispatcher has never run." },
            { ok: snap.status.failed7d === 0, text: `${snap.status.sent7d} sent in the last 7 days · ${snap.status.failed7d} failed · ${snap.status.pending} waiting.` },
          ].map((c, n) => (
            <li key={n} className="flex items-start gap-2">
              {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 text-red-600" />}
              <span className="text-slate-700 dark:text-slate-300">{c.text}</span>
            </li>
          ))}
        </ul>
        <details className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
          <summary className="cursor-pointer font-medium text-slate-900 dark:text-slate-100">Set up the schedule (once)</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-700 dark:text-slate-300">
            <li>On Vercel, add an environment variable <code>CRON_SECRET</code> with a long random value, then redeploy. The daily Vercel Cron in <code>vercel.json</code> uses it automatically.</li>
            <li>
              On <a className="underline" href="https://cron-job.org" target="_blank" rel="noopener noreferrer">cron-job.org</a> (free), create a job:
              <span className="mt-1 flex items-center gap-2">
                <code className="rounded bg-white px-1.5 py-0.5 dark:bg-slate-900">{origin}/api/cron/dispatch</code>
                <button type="button" aria-label="Copy URL" onClick={() => navigator.clipboard?.writeText(`${origin}/api/cron/dispatch`)} className="text-slate-500 hover:text-slate-900"><Copy className="h-3.5 w-3.5" /></button>
              </span>
              every 10 minutes, 08:00–21:00, time zone Europe/Lisbon, with the request header <code>Authorization: Bearer &lt;CRON_SECRET&gt;</code>.
            </li>
            <li>In Twilio, nothing else is needed: delivery reports come back to <code>/api/webhooks/twilio/status</code> automatically.</li>
          </ol>
        </details>
      </SectionCard>

      <SectionCard title="When to send" onSave={() => save({ reminderPolicy: policy }, "policy")} saving={saving === "policy"} dirty={dirty} canEdit={canEdit}>
        <div className="grid gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex w-56 items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
              <input type="checkbox" className="rounded accent-blue-600" disabled={!canEdit} checked={policy.confirmation.enabled} onChange={(e) => set({ confirmation: { ...policy.confirmation, enabled: e.target.checked } })} />
              Confirmation when booked
            </label>
            <ChannelPicker value={policy.confirmation.channels} disabled={!canEdit} onChange={(channels) => set({ confirmation: { ...policy.confirmation, channels } })} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex w-56 items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
              <input type="checkbox" className="rounded accent-blue-600" disabled={!canEdit} checked={policy.dayBefore.enabled} onChange={(e) => set({ dayBefore: { ...policy.dayBefore, enabled: e.target.checked } })} />
              Reminder the day before at
            </label>
            <Input type="time" className={`${inputCls} h-8 w-28`} disabled={!canEdit} value={policy.dayBefore.sendAt} onChange={(e) => set({ dayBefore: { ...policy.dayBefore, sendAt: e.target.value } })} />
            <ChannelPicker value={policy.dayBefore.channels} disabled={!canEdit} onChange={(channels) => set({ dayBefore: { ...policy.dayBefore, channels } })} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex w-56 items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
              <input type="checkbox" className="rounded accent-blue-600" disabled={!canEdit} checked={policy.hoursBefore.enabled} onChange={(e) => set({ hoursBefore: { ...policy.hoursBefore, enabled: e.target.checked } })} />
              Same-day reminder, hours before
            </label>
            <Input type="number" min={1} max={12} className={`${inputCls} h-8 w-20`} disabled={!canEdit} value={policy.hoursBefore.hours} onChange={(e) => set({ hoursBefore: { ...policy.hoursBefore, hours: Number(e.target.value) || 3 } })} />
            <ChannelPicker value={policy.hoursBefore.channels} disabled={!canEdit} onChange={(channels) => set({ hoursBefore: { ...policy.hoursBefore, channels } })} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-56 font-medium text-slate-900 dark:text-slate-100">Tell patients when</span>
            <label className="flex items-center gap-1.5"><input type="checkbox" className="rounded accent-blue-600" disabled={!canEdit} checked={policy.changeNotices.rescheduled} onChange={(e) => set({ changeNotices: { ...policy.changeNotices, rescheduled: e.target.checked } })} /> moved</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" className="rounded accent-blue-600" disabled={!canEdit} checked={policy.changeNotices.cancelled} onChange={(e) => set({ changeNotices: { ...policy.changeNotices, cancelled: e.target.checked } })} /> cancelled by the clinic</label>
            <ChannelPicker value={policy.changeNotices.channels} disabled={!canEdit} onChange={(channels) => set({ changeNotices: { ...policy.changeNotices, channels } })} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-56 font-medium text-slate-900 dark:text-slate-100">Only send between</span>
            <Input type="time" className={`${inputCls} h-8 w-28`} disabled={!canEdit} value={policy.quietHours.start} onChange={(e) => set({ quietHours: { ...policy.quietHours, start: e.target.value } })} />
            and
            <Input type="time" className={`${inputCls} h-8 w-28`} disabled={!canEdit} value={policy.quietHours.end} onChange={(e) => set({ quietHours: { ...policy.quietHours, end: e.target.value } })} />
          </div>
          <p className={hintCls}>
            Booked tomorrow? The confirmation counts as the reminder, so nobody gets two texts a few hours apart. Messages never include the treatment — only date, time, dentist and the confirm/cancel link.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="SMS text" description="Leave a box empty to use the built-in text." onSave={() => save({ reminderPolicy: policy }, "policy")} saving={saving === "policy"} dirty={dirty} canEdit={canEdit}>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" className="rounded accent-blue-600" disabled={!canEdit} checked={policy.smsPlainCharacters} onChange={(e) => set({ smsPlainCharacters: e.target.checked })} />
          Send without accents (ç, ã, é…) — keeps each SMS at 160 characters instead of 70, halving the cost
        </label>
        <p className={hintCls}>
          Tags: {MERGE_TAGS.map((t) => <code key={t} className="mr-1.5 rounded bg-slate-100 px-1 dark:bg-slate-800">{`{{${t}}}`}</code>)}
        </p>
        <div className="grid gap-4">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => {
            const raw = policy.smsTemplates[k] || snap.defaults.smsTemplates[k];
            const filled = fillTemplate(raw, sample);
            const text = policy.smsPlainCharacters ? plainCharacters(filled) : filled;
            const seg = smsSegments(text);
            return (
              <div key={k} className="grid gap-1.5">
                <label className={labelCls + " mb-0"} htmlFor={`tpl-${k}`}>{KIND_LABEL[k]}</label>
                <textarea
                  id={`tpl-${k}`}
                  rows={2}
                  maxLength={480}
                  disabled={!canEdit}
                  placeholder={snap.defaults.smsTemplates[k]}
                  value={policy.smsTemplates[k]}
                  onChange={(e) => set({ smsTemplates: { ...policy.smsTemplates, [k]: e.target.value } })}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
                <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                  <span className="mr-2 font-medium">Preview</span>{text}
                  <span className={`ml-2 whitespace-nowrap ${seg.segments > 1 ? "text-amber-600" : "text-slate-500"}`}>
                    · {seg.length} chars · {seg.segments} SMS{seg.encoding === "UCS-2" ? " (accents: 70/SMS)" : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {canEdit && (
        <SectionCard title="Send a test" description="Uses the saved text with a sample appointment tomorrow.">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className={labelCls}>Channel</label>
              <select className={selectCls + " w-28"} value={test.channel} onChange={(e) => setTest({ ...test, channel: e.target.value as Channel })}>
                <option value="SMS">SMS</option>
                <option value="EMAIL">Email</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Message</label>
              <select className={selectCls + " w-56"} value={test.kind} onChange={(e) => setTest({ ...test, kind: e.target.value as Kind })}>
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </div>
            <div className="min-w-56 flex-1">
              <label className={labelCls}>{test.channel === "SMS" ? "Your mobile" : "Your email"}</label>
              <Input className={inputCls} value={test.to} onChange={(e) => setTest({ ...test, to: e.target.value })} placeholder={test.channel === "SMS" ? "912 345 678" : "you@example.pt"} />
            </div>
            <Button size="sm" className="gap-1.5" disabled={saving === "test" || test.to.trim().length < 3} onClick={sendTest}>
              {saving === "test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send test
            </Button>
          </div>
          {testResult && <p className="text-sm text-slate-700 dark:text-slate-300">{testResult}</p>}
        </SectionCard>
      )}
    </div>
  );
}
