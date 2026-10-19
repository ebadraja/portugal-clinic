"use client";

import { useMemo, useState } from "react";
import { Download, Edit, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/toast-provider";
import { LoadState, ReadOnlyNotice, SectionCard, inputCls, labelCls, sendJson, useIsAdmin, useJson } from "@/components/settings/shared";

type Item = { id: string; category: string; question: string; answer: string; priority: number; isActive: boolean; timesAsked: number; lastAskedAt: string | null };
type DraftItem = { id?: string; category: string; question: string; answer: string; priority: number; isActive: boolean };

const EMPTY: DraftItem = { category: "", question: "", answer: "", priority: 0, isActive: true };

export function KnowledgeBaseTab() {
  const isAdmin = useIsAdmin();
  const { showToast } = useToast();
  const kb = useJson<{ data: Item[]; defaultsAvailable: number }>("/api/knowledge");
  const items = useMemo(() => kb.data?.data ?? [], [kb.data]);
  const defaultsAvailable = kb.data?.defaultsAvailable ?? 0;
  const { loading, error, reload: retry } = kb;
  const load = retry;
  const [editing, setEditing] = useState<DraftItem | null>(null);
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) map.set(it.category, [...(map.get(it.category) ?? []), it]);
    return [...map.entries()];
  }, [items]);

  const importDefaults = async () => {
    setBusy(true);
    try {
      const r = await sendJson<{ imported: number; skipped: number }>("/api/knowledge", "POST", { action: "import_defaults" });
      showToast(r.imported > 0 ? `Imported ${r.imported} answers from the website FAQ` : "The website FAQ is already imported", "success");
      load();
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const saveItem = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const { id, ...body } = editing;
      if (id) await sendJson(`/api/knowledge/${id}`, "PATCH", body);
      else await sendJson("/api/knowledge", "POST", body);
      showToast("Saved", "success");
      setEditing(null);
      load();
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (it: Item) => {
    try {
      await sendJson(`/api/knowledge/${it.id}`, "PATCH", { isActive: !it.isActive });
      load();
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  const remove = async (it: Item) => {
    if (!confirm(`Delete “${it.question}”? The agent will stop using this answer.`)) return;
    try {
      await sendJson(`/api/knowledge/${it.id}`, "DELETE");
      showToast("Deleted", "success");
      load();
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  if (loading && items.length === 0) return <LoadState loading error={null} onRetry={retry} />;
  if (error) return <LoadState loading={false} error={error} onRetry={retry} />;

  return (
    <div className="space-y-6">
      {!isAdmin && <ReadOnlyNotice />}
      <SectionCard
        title="Approved answers"
        description="Acácia answers general questions only from this list (answer_question tool) and offers a callback when nothing matches — it never improvises prices or policies. Keep it identical to the website FAQ."
        actions={
          isAdmin ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={importDefaults} disabled={busy} className="gap-1.5">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Import website FAQ ({defaultsAvailable})
              </Button>
              <Button size="sm" onClick={() => setEditing({ ...EMPTY })} className="gap-1.5 bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4" />Add answer</Button>
            </div>
          ) : undefined
        }
      >
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-sm text-slate-600 dark:text-slate-400">
            No approved answers yet, so the agent will offer a callback for every general question. Import the website FAQ to start.
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([category, list]) => (
              <div key={category}>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">{category}</p>
                <ul className="space-y-2">
                  {list.map((it) => (
                    <li key={it.id} className={`rounded-lg border border-slate-200 dark:border-slate-700 p-3 ${it.isActive ? "" : "opacity-60"}`}>
                      <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{it.question}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap">{it.answer}</p>
                          <p className="text-xs text-slate-400 mt-1">Used {it.timesAsked}×{it.lastAskedAt ? ` · last ${new Date(it.lastAskedAt).toLocaleDateString("pt-PT")}` : ""}{it.isActive ? "" : " · inactive"}</p>
                        </div>
                        {isAdmin && (
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="sm" onClick={() => toggle(it)}>{it.isActive ? "Disable" : "Enable"}</Button>
                            <Button variant="ghost" size="sm" aria-label="Edit" onClick={() => setEditing({ id: it.id, category: it.category, question: it.question, answer: it.answer, priority: it.priority, isActive: it.isActive })}><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" aria-label="Delete" onClick={() => remove(it)} className="text-red-600"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o && !busy) setEditing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit answer" : "Add answer"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Category</label>
                <Input value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} placeholder="Preços, Seguros, Horário…" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Question (include the words callers use)</label>
                <Input value={editing.question} onChange={(e) => setEditing({ ...editing, question: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Approved answer (pt-PT)</label>
                <Textarea rows={4} value={editing.answer} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} />
              </div>
              <div className="flex items-center gap-4">
                <div className="w-28">
                  <label className={labelCls}>Priority</label>
                  <Input type="number" min={0} max={10} value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) })} className={inputCls} />
                </div>
                <label className="flex items-center gap-2 text-sm mt-6 text-slate-700 dark:text-slate-300">
                  <input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} className="rounded accent-blue-600" />Active
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
                <Button onClick={saveItem} disabled={busy || !editing.category.trim() || editing.question.trim().length < 3 || !editing.answer.trim()} className="bg-blue-600 hover:bg-blue-700">Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
