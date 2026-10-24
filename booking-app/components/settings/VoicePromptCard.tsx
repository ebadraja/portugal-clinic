"use client";

/**
 * Settings → AI Voice Agent → "Acácia's instructions": edit the prompt and first message the
 * CRM-built Acácia uses, with live variables, the required-clause check, a preview and history.
 * Server side: lib/voice/promptEditor.ts.
 */
import { useRef, useState } from "react";
import { Eye, History, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/toast-provider";
import { LoadState, SectionCard, StatusIcon, hintCls, inputCls, labelCls, sendJson, useJson } from "@/components/settings/shared";
import { checkPromptClauses } from "@/lib/voice/contract";
import { unknownVariables } from "@/lib/voice/promptTemplate";

type Version = { id: string; prompt: string; firstMessage: string; isDefault: boolean; note: string | null; createdByName: string | null; createdAt: string };
type EditorState = {
  prompt: string;
  firstMessage: string;
  isCustom: boolean;
  defaults: { prompt: string; firstMessage: string };
  variables: { name: string; description: string; value: string }[];
  transientEnabled: boolean;
  versions: Version[];
};
type Preview = { prompt: string; firstMessage: string; check: { errors: string[] } };

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function VoicePromptCard() {
  const { showToast } = useToast();
  const { data, loading, error, reload, setData } = useJson<EditorState>("/api/settings/voice-prompt");
  const [draft, setDraft] = useState<{ prompt: string; firstMessage: string } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"save" | "preview" | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const firstRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<"prompt" | "firstMessage">("prompt");

  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;

  const prompt = draft?.prompt ?? data.prompt;
  const firstMessage = draft?.firstMessage ?? data.firstMessage;
  const dirty = prompt !== data.prompt || firstMessage !== data.firstMessage;
  const clauses = checkPromptClauses(`${prompt} ${firstMessage}`);
  const unknown = unknownVariables(`${prompt}\n${firstMessage}`);
  const isBuiltIn = prompt === data.defaults.prompt && firstMessage.trim() === data.defaults.firstMessage;

  const edit = (patch: Partial<{ prompt: string; firstMessage: string }>) => setDraft({ prompt, firstMessage, ...patch });

  const insert = (name: string) => {
    const field = lastField.current;
    const el = field === "prompt" ? promptRef.current : firstRef.current;
    const text = field === "prompt" ? prompt : firstMessage;
    const tag = `{{${name}}}`;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    edit({ [field]: text.slice(0, start) + tag + text.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + tag.length, start + tag.length);
    });
  };

  const save = async () => {
    setBusy("save");
    try {
      setData(await sendJson<EditorState>("/api/settings/voice-prompt", "PUT", { prompt, firstMessage, note }));
      setDraft(null);
      setNote("");
      showToast("Saved. The next call uses it. Press “Set up in Vapi” to refresh the preview assistant.", "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const showPreview = async () => {
    setBusy("preview");
    try {
      setPreview(await sendJson<Preview>("/api/settings/voice-prompt/preview", "POST", { prompt, firstMessage }));
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <SectionCard
      title="Acácia's instructions"
      description="The first message and the instructions (system prompt) the CRM-built Acácia follows on every call. Words in {{double braces}} are filled in for each call from Settings, so the date, opening hours, dentists, services and insurers stay current."
      actions={
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${data.isCustom ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
          {data.isCustom ? "Edited" : "Built-in"}
        </span>
      }
    >
      {!data.transientEnabled && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Calls are answered by the saved assistant in Vapi, which has its own prompt. These instructions apply once “Answer calls with the CRM-built Acácia” is switched on (above). You can edit and preview them now.
        </p>
      )}

      <div>
        <p className={labelCls}>Required instructions</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {clauses.map((c) => (
            <li key={c.id} className="flex items-center gap-1.5 text-sm">
              <StatusIcon status={c.present ? "ok" : "fail"} />
              <span className={c.present ? "text-slate-700 dark:text-slate-300" : "font-medium text-red-700 dark:text-red-300"}>{c.label}</span>
            </li>
          ))}
        </ul>
        <p className={hintCls}>The law and the clinic require these. Saving is blocked while one is missing.</p>
      </div>

      <div>
        <label className={labelCls} htmlFor="voice-first-message">First message</label>
        <Textarea
          id="voice-first-message"
          ref={firstRef}
          rows={2}
          value={firstMessage}
          onFocus={() => (lastField.current = "firstMessage")}
          onChange={(e) => edit({ firstMessage: e.target.value })}
          className={inputCls}
        />
        <p className={hintCls}>What Acácia says when she picks up. It must say she is a virtual assistant and that the call may be recorded.</p>
      </div>

      <div>
        <label className={labelCls} htmlFor="voice-prompt">System prompt</label>
        <Textarea
          id="voice-prompt"
          ref={promptRef}
          rows={22}
          value={prompt}
          spellCheck={false}
          onFocus={() => (lastField.current = "prompt")}
          onChange={(e) => edit({ prompt: e.target.value })}
          className={`${inputCls} font-mono text-xs leading-relaxed`}
        />
        <p className={hintCls}>{prompt.length.toLocaleString("en")} characters. Write in Portuguese: it is what Acácia reads before every call.</p>
        {unknown.length > 0 && (
          <p className="mt-1 text-sm font-medium text-red-700 dark:text-red-300">
            Unknown variable{unknown.length > 1 ? "s" : ""}: {unknown.map((u) => `{{${u}}}`).join(", ")}. Use one from the list below.
          </p>
        )}
      </div>

      <details className="rounded-lg border border-slate-200 dark:border-slate-700">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-200">Variables you can use ({data.variables.length})</summary>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.variables.map((v) => (
            <li key={v.name} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-3">
              <button type="button" onClick={() => insert(v.name)} title="Insert where the cursor is" className="justify-self-start rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-blue-700 hover:bg-blue-50 dark:bg-slate-800 dark:text-blue-300">
                {`{{${v.name}}}`}
              </button>
              <div className="min-w-0">
                <p className="text-slate-700 dark:text-slate-300">{v.description}</p>
                <p className="truncate text-xs text-slate-500" title={v.value}>Now: {v.value || "—"}</p>
              </div>
            </li>
          ))}
        </ul>
      </details>

      <div>
        <label className={labelCls} htmlFor="voice-prompt-note">What changed? (optional)</label>
        <Input id="voice-prompt-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Mention free parking" className={inputCls} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <Button variant="outline" size="sm" onClick={showPreview} disabled={busy !== null} className="gap-1.5">
          {busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}Preview for a call now
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowHistory((s) => !s)} className="gap-1.5">
          <History className="h-3.5 w-3.5" />History ({data.versions.length})
        </Button>
        {!isBuiltIn && (
          <Button variant="ghost" size="sm" onClick={() => edit({ prompt: data.defaults.prompt, firstMessage: data.defaults.firstMessage })} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />Load the built-in text
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>}
          {dirty && <Button variant="ghost" size="sm" onClick={() => { setDraft(null); setNote(""); }} disabled={busy !== null}>Discard</Button>}
          <Button size="sm" onClick={save} disabled={!dirty || busy !== null || unknown.length > 0 || clauses.some((c) => !c.present)} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
            {busy === "save" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save
          </Button>
        </div>
      </div>

      {showHistory && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700">
          {data.versions.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">No edits yet: calls use the built-in text.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.versions.map((v, i) => (
                <li key={v.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="text-slate-800 dark:text-slate-200">{fmt(v.createdAt)}</span>
                  <span className="text-slate-500">{v.createdByName ?? "—"}</span>
                  {i === 0 && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">In use</span>}
                  {v.isDefault && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">Built-in</span>}
                  {v.note && <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-400" title={v.note}>{v.note}</span>}
                  {i > 0 && (
                    <Button size="sm" variant="ghost" className="ml-auto gap-1" onClick={() => { edit({ prompt: v.prompt, firstMessage: v.firstMessage }); setNote(`Restored ${fmt(v.createdAt)}`); showToast("Loaded into the editor. Save to use it.", "success"); }}>
                      <RotateCcw className="h-3.5 w-3.5" />Restore
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[85vh] w-full max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>What a call starting now would get</DialogTitle></DialogHeader>
          {preview && (
            <div className="space-y-3 text-sm">
              {preview.check.errors.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                  {preview.check.errors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              )}
              <div>
                <p className={labelCls}>First message</p>
                <p className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">{preview.firstMessage}</p>
              </div>
              <div>
                <p className={labelCls}>System prompt</p>
                <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-xs leading-relaxed dark:bg-slate-800/50">{preview.prompt}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
