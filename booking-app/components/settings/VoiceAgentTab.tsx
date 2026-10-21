"use client";

import { useState } from "react";
import { Check, ClipboardCheck, Copy, Loader2, PauseCircle, PlayCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/toast-provider";
import { LoadState, ReadOnlyNotice, SectionCard, StatusIcon, hintCls, inputCls, labelCls, sendJson, useIsAdmin, useJson } from "@/components/settings/shared";
import { useClinicSettings, useDraft } from "@/components/settings/use-clinic-settings";
import { VapiConnectionCard } from "@/components/settings/VapiConnectionCard";

type VoiceStatus = {
  paused: boolean;
  name: string;
  transferPhone: string;
  webhookUrl: string;
  secretConfigured: boolean;
  unsignedDevMode: boolean;
  delivery: {
    lastReportAt: string | null;
    lastToolCallAt: string | null;
    rejected24h: number;
    errors24h: number;
    processed24h: number;
    recentProblems: { receivedAt: string; eventType: string; outcome: string; reason: string | null; explanation: string }[];
  };
  tools: unknown[];
  structuredOutputSchema: unknown;
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="gap-1.5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {done ? "Copied" : label}
    </Button>
  );
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }) : "Never");

export function VoiceAgentTab() {
  const isAdmin = useIsAdmin();
  const { showToast } = useToast();
  const clinic = useClinicSettings();
  const { data: status, loading, error, reload: retry, setData: setStatus } = useJson<VoiceStatus>("/api/settings/voice-agent");
  const [identity, setIdentity, identityDirty] = useDraft(status ? { name: status.name, transferPhone: status.transferPhone } : undefined);
  const [insurers, setInsurers, insurersDirty] = useDraft(clinic.data?.insurers);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [confirmPause, setConfirmPause] = useState(false);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [clauses, setClauses] = useState<{ id: string; label: string; present: boolean }[] | null>(null);
  const [checking, setChecking] = useState(false);

  if (!status) return <LoadState loading={loading} error={error} onRetry={retry} />;

  const togglePause = async () => {
    setPauseBusy(true);
    try {
      const body = await sendJson<{ paused: boolean }>("/api/settings/voice-agent", "PATCH", { paused: !status.paused });
      setStatus({ ...status, paused: body.paused });
      showToast(body.paused ? "Voice tools paused" : "Voice tools active again", "success");
      setConfirmPause(false);
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setPauseBusy(false);
    }
  };

  const saveIdentity = async () => {
    if (!identity) return;
    setSavingIdentity(true);
    try {
      const body = await sendJson<{ name: string; transferPhone: string }>("/api/settings/voice-agent", "PATCH", identity);
      setStatus({ ...status, ...body });
      showToast("Saved", "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setSavingIdentity(false);
    }
  };

  const checkPrompt = async () => {
    setChecking(true);
    try {
      const body = await sendJson<{ clauses: { id: string; label: string; present: boolean }[] }>("/api/settings/voice-agent/check-prompt", "POST", { prompt });
      setClauses(body.clauses);
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setChecking(false);
    }
  };

  const d = status.delivery;
  const toolsJson = JSON.stringify(status.tools, null, 2);
  const schemaJson = JSON.stringify(status.structuredOutputSchema, null, 2);

  return (
    <div className="space-y-6">
      {!isAdmin && <ReadOnlyNotice />}

      {isAdmin && <VapiConnectionCard />}

      <SectionCard
        title="Voice agent status"
        description="The kill switch stops the agent from looking up patients or changing bookings. It can still take a callback request and hand over to the team."
        actions={
          <Button size="sm" variant="outline" onClick={retry} className="gap-1.5"><RefreshCw className="h-4 w-4" />Refresh</Button>
        }
      >
        <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg p-4 ${status.paused ? "bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900" : "bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900"}`}>
          <div className="flex items-center gap-3">
            {status.paused ? <PauseCircle className="h-6 w-6 text-amber-600" /> : <PlayCircle className="h-6 w-6 text-emerald-600" />}
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-50">{status.paused ? "Paused — callbacks and transfers only" : "Active — booking tools available"}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Takes effect on the next tool call; no redeploy needed.</p>
            </div>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setConfirmPause(true)} className={status.paused ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}>
              {status.paused ? "Resume tools" : "Pause tools"}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          {[
            ["Last call report", when(d.lastReportAt)],
            ["Last tool call", when(d.lastToolCallAt)],
            ["Processed (24 h)", String(d.processed24h)],
            ["Refused / failed (24 h)", `${d.rejected24h} / ${d.errors24h}`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">{k}</p>
              <p className={`font-semibold ${k.startsWith("Refused") && (d.rejected24h > 0 || d.errors24h > 0) ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-50"}`}>{v}</p>
            </div>
          ))}
        </div>
        {d.recentProblems.length > 0 && (
          <div className="space-y-2">
            <p className={labelCls}>Recent refused or failed deliveries</p>
            <ul className="space-y-2">
              {d.recentProblems.map((p, i) => (
                <li key={i} className="text-sm rounded-md border border-red-100 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/30 p-2">
                  <span className="font-mono text-xs text-slate-500">{when(p.receivedAt)} · {p.eventType} · {p.outcome}</span>
                  <p className="text-slate-700 dark:text-slate-300">{p.explanation}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>

      {identity && (
        <SectionCard title="Agent identity & hand-over" description="Used in tool answers and staff notifications." onSave={saveIdentity} saving={savingIdentity} dirty={identityDirty} canEdit={isAdmin}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Agent name</label>
              <Input value={identity.name} disabled={!isAdmin} onChange={(e) => setIdentity({ ...identity, name: e.target.value })} className={inputCls} />
              <p className={hintCls}>Keep it identical to the name in the Vapi prompt.</p>
            </div>
            <div>
              <label className={labelCls}>Transfer number (reception)</label>
              <Input type="tel" value={identity.transferPhone} disabled={!isAdmin} onChange={(e) => setIdentity({ ...identity, transferPhone: e.target.value })} className={inputCls} />
              <p className={hintCls}>The agent is told to transfer here during opening hours, and to take a callback when closed.</p>
            </div>
          </div>
        </SectionCard>
      )}

      {insurers && (
        <SectionCard title="Insurers & agreements" description="Answers to “do you accept…?” (verify_insurance tool)." onSave={() => clinic.save("insurers", { insurers })} saving={clinic.savingSection === "insurers"} dirty={insurersDirty} canEdit={isAdmin}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Accepted (one per line)</label>
              <Textarea rows={4} value={insurers.accepted.join("\n")} disabled={!isAdmin} onChange={(e) => setInsurers({ ...insurers, accepted: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
            </div>
            <div>
              <label className={labelCls}>Not accepted (one per line)</label>
              <Textarea rows={4} value={insurers.notAccepted.join("\n")} disabled={!isAdmin} onChange={(e) => setInsurers({ ...insurers, notAccepted: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Payment note</label>
            <Input value={insurers.note} disabled={!isAdmin} onChange={(e) => setInsurers({ ...insurers, note: e.target.value })} className={inputCls} />
          </div>
        </SectionCard>
      )}

      <SectionCard title="Connect Vapi" description="Configure the assistant in the Vapi dashboard with exactly these values. They are generated from the CRM code, so they always match what it expects.">
        <div className="space-y-2">
          <label className={labelCls}>Server URL</label>
          <div className="flex gap-2">
            <Input readOnly value={status.webhookUrl} className={`font-mono text-xs ${inputCls}`} />
            <CopyButton text={status.webhookUrl} label="Copy" />
          </div>
        </div>
        <div className="flex items-start gap-2 text-sm">
          <StatusIcon status={status.secretConfigured ? "ok" : status.unsignedDevMode ? "warn" : "fail"} />
          <span className="text-slate-700 dark:text-slate-300">
            {status.secretConfigured
              ? "Server secret is configured. Set the same value as the assistant's server secret (sent as x-vapi-secret)."
              : status.unsignedDevMode
                ? "Development mode: unsigned requests are accepted (VAPI_ALLOW_UNSIGNED). Never use this in production."
                : "VAPI_WEBHOOK_SECRET is not set — every request from Vapi is refused. Set it in the hosting environment, then in Vapi."}
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={labelCls}>Tools ({status.tools.length})</label>
              <CopyButton text={toolsJson} label="Copy JSON" />
            </div>
            <pre className="text-[11px] bg-slate-50 dark:bg-slate-800/60 rounded-md p-3 max-h-64 overflow-auto">{toolsJson}</pre>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={labelCls}>Structured output schema</label>
              <CopyButton text={schemaJson} label="Copy JSON" />
            </div>
            <pre className="text-[11px] bg-slate-50 dark:bg-slate-800/60 rounded-md p-3 max-h-64 overflow-auto">{schemaJson}</pre>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Check the agent's prompt" description="Paste the system prompt from Vapi. The CRM checks it contains the clauses this clinic requires. Nothing is stored or sent to Vapi.">
        <Textarea rows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Cola aqui o prompt do assistente…" />
        <div className="flex justify-end">
          <Button size="sm" onClick={checkPrompt} disabled={!prompt.trim() || checking} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}Check prompt
          </Button>
        </div>
        {clauses && (
          <ul className="space-y-1.5">
            {clauses.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <StatusIcon status={c.present ? "ok" : "fail"} />
                <span className={c.present ? "text-slate-700 dark:text-slate-300" : "text-red-700 dark:text-red-300 font-medium"}>{c.label}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <Dialog open={confirmPause} onOpenChange={(o) => { if (!pauseBusy) setConfirmPause(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{status.paused ? "Resume the voice agent's tools?" : "Pause the voice agent's tools?"}</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {status.paused
              ? "The agent will again be able to verify patients, check availability and book, reschedule or cancel appointments."
              : "Until you resume, the agent cannot look up patients or touch the calendar. Callers will be offered a callback or a transfer to the team."}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmPause(false)} disabled={pauseBusy}>Cancel</Button>
            <Button onClick={togglePause} disabled={pauseBusy} className={status.paused ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}>
              {pauseBusy ? "Saving…" : status.paused ? "Resume" : "Pause"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
