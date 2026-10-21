"use client";

/**
 * Settings → AI Voice Agent → Vapi connection: the private API key and the IDs the CRM needs to
 * build Acácia as a CRM-generated (transient) assistant and to read call costs.
 */
import { useState } from "react";
import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast-provider";
import { LoadState, SectionCard, hintCls, labelCls, sendJson, useJson } from "@/components/settings/shared";

type VapiStatus = { hasApiKey: boolean; assistantId: string; phoneNumberId: string; lastSync: string | null };
type Check = { label: string; ok: boolean; detail: string };
type TestResult = {
  checks: Check[];
  assistants: { id: string; name: string }[];
  phoneNumbers: { id: string; number: string; name: string; assistantId: string | null; serverUrl: string | null }[];
};

export function VapiConnectionCard() {
  const { showToast } = useToast();
  const { data, loading, error, reload, setData } = useJson<VapiStatus>("/api/settings/vapi");
  const [apiKey, setApiKey] = useState("");
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const [phoneId, setPhoneId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;

  const assistantValue = assistantId ?? data.assistantId;
  const phoneValue = phoneId ?? data.phoneNumberId;
  const dirty = !!apiKey.trim() || assistantValue !== data.assistantId || phoneValue !== data.phoneNumberId;

  const test = async () => {
    setTesting(true);
    try {
      setResult(await sendJson<TestResult>("/api/settings/vapi/test", "POST", {}));
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = await sendJson<VapiStatus>("/api/settings/vapi", "PUT", {
        ...(apiKey.trim() && { apiKey: apiKey.trim() }),
        assistantId: assistantValue.trim(),
        phoneNumberId: phoneValue.trim(),
      });
      setData(body);
      setApiKey("");
      setAssistantId(null);
      setPhoneId(null);
      showToast("Vapi connection saved", "success");
      await test();
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const pickCls = "rounded-md border border-slate-200 px-2 py-1 text-left text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800";

  return (
    <SectionCard
      title="Vapi connection"
      description="Lets the CRM build Acácia's assistant itself (prompt, tools, live clinic data) and read call costs. The private key is stored encrypted and never shown again."
      actions={
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${data.hasApiKey ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
          <PlugZap className="h-3.5 w-3.5" />{data.hasApiKey ? "Key saved" : "Not connected"}
        </span>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 sm:col-span-2">
          <span className={labelCls}>Private API key</span>
          <Input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={data.hasApiKey ? "•••••••• saved — leave blank to keep it" : "Vapi → Organization → API Keys → Private key"} />
        </label>
        <label className="grid gap-1.5">
          <span className={labelCls}>Acácia&apos;s assistant ID</span>
          <Input value={assistantValue} onChange={(e) => setAssistantId(e.target.value)} placeholder="e.g. 3f1c…-…" />
          <span className={hintCls}>The assistant answering today — its voice and transcriber settings are kept.</span>
        </label>
        <label className="grid gap-1.5">
          <span className={labelCls}>Clinic phone number ID</span>
          <Input value={phoneValue} onChange={(e) => setPhoneId(e.target.value)} placeholder="e.g. 9a2b…-…" />
          <span className={hintCls}>From Vapi → Phone Numbers. Press “Test connection” to pick from a list.</span>
        </label>
      </div>

      {result && (
        <div className="mt-4 grid gap-3">
          <ul className="grid gap-1.5 text-sm">
            {result.checks.map((c) => (
              <li key={c.label} className="flex items-start gap-2">
                {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
                <span><strong>{c.label}:</strong> {c.detail}</span>
              </li>
            ))}
          </ul>
          {result.assistants.length > 0 && (
            <div>
              <p className={labelCls}>Assistants in Vapi — click to use</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {result.assistants.map((a) => (
                  <button key={a.id} type="button" className={`${pickCls} ${assistantValue === a.id ? "border-blue-500" : ""}`} onClick={() => setAssistantId(a.id)}>{a.name}</button>
                ))}
              </div>
            </div>
          )}
          {result.phoneNumbers.length > 0 && (
            <div>
              <p className={labelCls}>Phone numbers in Vapi — click to use</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {result.phoneNumbers.map((p) => (
                  <button key={p.id} type="button" className={`${pickCls} ${phoneValue === p.id ? "border-blue-500" : ""}`} onClick={() => setPhoneId(p.id)}>{p.number || p.name || p.id}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={test} disabled={testing || !data.hasApiKey}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Test connection
        </Button>
        <Button onClick={save} disabled={saving || !dirty}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
        </Button>
      </div>
    </SectionCard>
  );
}
