"use client";

/**
 * Settings → AI Voice Agent → "Acácia built by the CRM": set up in Vapi, preview exactly what a
 * call gets, switch it on/off, and point the clinic number at the CRM (or back).
 * Plan: docs/voice/vapi-transient-agent-plan.md.
 */
import { useState } from "react";
import { CheckCircle2, Circle, Download, Loader2, PhoneForwarded, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";
import { LoadState, SectionCard, hintCls, sendJson, useJson } from "@/components/settings/shared";

type VapiStatus = {
  hasApiKey: boolean;
  assistantId: string;
  phoneNumberId: string;
  transientEnabled: boolean;
  voiceCopied: boolean;
  structuredOutputId: string;
  previewAssistantId: string;
  webhookSecretSet: boolean;
};
type Step = { step: string; ok: boolean; detail: string };
type Preview = { promptVersion: string; firstMessage: string; prompt: string; tools: string[]; model: string; voice: string; voiceCopied: boolean; assistant: unknown };

function Tick({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />}
      <span className={ok ? "text-slate-800 dark:text-slate-200" : "text-slate-500"}>{label}</span>
    </span>
  );
}

export function VapiAssistantCard() {
  const { showToast } = useToast();
  const { data, loading, error, reload, setData } = useJson<VapiStatus>("/api/settings/vapi");
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmOn, setConfirmOn] = useState(false);

  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;

  const setup = async () => {
    setBusy("setup");
    try {
      const r = await sendJson<{ ok: boolean; steps: Step[] }>("/api/settings/vapi/setup", "POST", {});
      setSteps(r.steps);
      showToast(r.ok ? "Vapi is set up" : "Some steps need attention", r.ok ? "success" : "error");
      await reload();
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (on: boolean) => {
    setBusy("toggle");
    try {
      setData(await sendJson<VapiStatus>("/api/settings/vapi", "PUT", { transientEnabled: on }));
      setConfirmOn(false);
      showToast(on ? "Calls are now answered by the CRM-built Acácia" : "Calls are answered by the saved assistant again", "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const point = async (target: "crm" | "saved") => {
    setBusy(target);
    try {
      const s = await sendJson<Step>("/api/settings/vapi/phone-number", "POST", { target });
      setSteps([s]);
      showToast(s.detail, s.ok ? "success" : "error");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const loadPreview = async () => {
    setBusy("preview");
    try {
      const res = await fetch("/api/settings/vapi/assistant");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not build the preview");
      setPreview(await res.json());
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const download = () => {
    if (!preview) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(preview.assistant, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "acacia-assistant.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const ready = data.hasApiKey && data.webhookSecretSet;

  return (
    <SectionCard
      title="Acácia built by the CRM"
      description="On every call Vapi asks the CRM which assistant answers. The CRM builds Acácia for that moment: today's date, whether the clinic is open, dentists, services, insurers — and the booking tools. Nothing to maintain in the Vapi dashboard."
      actions={
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${data.transientEnabled ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
          <Sparkles className="h-3.5 w-3.5" />{data.transientEnabled ? "Answering calls" : "Off — saved assistant answers"}
        </span>
      }
    >
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Tick ok={data.hasApiKey} label="Vapi key saved" />
        <Tick ok={data.webhookSecretSet} label="Webhook secret on the server" />
        <Tick ok={data.voiceCopied} label="Acácia's voice copied" />
        <Tick ok={!!data.structuredOutputId} label="Structured output in Vapi" />
        <Tick ok={!!data.previewAssistantId} label="Preview assistant in Vapi" />
        <Tick ok={!!data.phoneNumberId} label="Clinic number chosen" />
      </div>

      <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-slate-700 dark:text-slate-300">
        <li><strong>Set up in Vapi</strong> — copies Acácia&apos;s voice, creates the call-result output and a preview assistant (&quot;Acácia (CRM) — pré-visualização&quot;).</li>
        <li>In Vapi → Assistants, open the preview and press <strong>Talk</strong> to test it (book, cancel, ask a price, ask for a person).</li>
        <li><strong>Point the clinic number at the CRM</strong>. While the switch below is off, the CRM still hands calls to the saved Acácia — nothing changes for callers.</li>
        <li>Switch on <strong>Answer calls with the CRM-built Acácia</strong>. To undo, switch it off (instant).</li>
      </ol>

      {steps && (
        <ul className="mt-4 grid gap-1.5 text-sm">
          {steps.map((s) => (
            <li key={s.step} className="flex items-start gap-2">
              {s.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
              <span><strong>{s.step}:</strong> {s.detail}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={setup} disabled={!ready || busy !== null}>{busy === "setup" && <Loader2 className="h-4 w-4 animate-spin" />} Set up in Vapi</Button>
        <Button variant="outline" onClick={() => point("crm")} disabled={!ready || !data.phoneNumberId || busy !== null} className="gap-1.5">
          {busy === "crm" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneForwarded className="h-4 w-4" />} Point the clinic number at the CRM
        </Button>
        <Button variant="ghost" onClick={() => point("saved")} disabled={!data.phoneNumberId || !data.assistantId || busy !== null}>
          {busy === "saved" && <Loader2 className="h-4 w-4 animate-spin" />} Number back to the saved assistant
        </Button>
        <Button variant="ghost" onClick={loadPreview} disabled={busy !== null}>{busy === "preview" && <Loader2 className="h-4 w-4 animate-spin" />} Preview what callers get</Button>
      </div>
      {!data.phoneNumberId && <p className={`${hintCls} mt-2`}>Pick the clinic number in “Vapi connection” above (Test connection lists them) to enable the number buttons.</p>}

      <div className={`mt-5 flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center sm:justify-between ${data.transientEnabled ? "border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30" : "border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40"}`}>
        <div>
          <p className="font-medium text-slate-900 dark:text-slate-50">Answer calls with the CRM-built Acácia</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">Takes effect on the next call. Off = the saved assistant answers, exactly as before.</p>
        </div>
        {data.transientEnabled ? (
          <Button variant="outline" onClick={() => toggle(false)} disabled={busy !== null}>Switch off</Button>
        ) : confirmOn ? (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setConfirmOn(false)}>Cancel</Button>
            <Button onClick={() => toggle(true)} disabled={busy !== null}>{busy === "toggle" && <Loader2 className="h-4 w-4 animate-spin" />} Yes, switch on</Button>
          </div>
        ) : (
          <Button onClick={() => setConfirmOn(true)} disabled={!ready || busy !== null}>Switch on</Button>
        )}
      </div>

      {preview && (
        <div className="mt-5 grid gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600 dark:text-slate-300">
            <span>Model <strong>{preview.model}</strong></span>
            <span>Voice <strong>{preview.voice}</strong>{preview.voiceCopied ? " (Acácia's)" : " (default — run Set up to copy Acácia's)"}</span>
            <span>Prompt version {preview.promptVersion}</span>
            <Button size="sm" variant="ghost" onClick={download} className="ml-auto gap-1"><Download className="h-3.5 w-3.5" />Full JSON</Button>
          </div>
          <p><strong>Says first:</strong> “{preview.firstMessage}”</p>
          <p><strong>Tools:</strong> {preview.tools.join(", ")}</p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800 dark:bg-slate-900 dark:text-slate-200">{preview.prompt}</pre>
        </div>
      )}
    </SectionCard>
  );
}
