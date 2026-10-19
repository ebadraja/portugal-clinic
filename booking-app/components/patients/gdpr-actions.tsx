"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Download, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Admin-only GDPR actions on a patient: export (art. 15/20) and permanent erasure (art. 17). */
export function PatientGdprActions({ patientId, fullName }: { patientId: string; fullName: string }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session?.user?.role !== "ADMIN") return null;

  const nameMatches = confirmName.trim().toLowerCase().replace(/\s+/g, " ") === fullName.trim().toLowerCase().replace(/\s+/g, " ");

  const erase = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${patientId}/erase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Erasure failed.");
        return;
      }
      const leftovers = data.documentsNeedingManualRemoval > 0 || data.filesFailed?.length > 0
        ? `&leftovers=${data.documentsNeedingManualRemoval + (data.filesFailed?.length ?? 0)}`
        : "";
      router.push(`/patients?erased=1${leftovers}`);
    } catch {
      setError("Network error — nothing was confirmed as deleted. Check the patient list.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { window.location.href = `/api/patients/${patientId}/export`; }}>
        <Download className="h-4 w-4" />Export data
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-900 dark:hover:bg-red-950/40" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />Erase…
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <ShieldAlert className="h-5 w-5" />Permanently erase {fullName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 p-3 text-red-800 dark:text-red-300 space-y-1">
              <p className="font-medium">This cannot be undone.</p>
              <p>Deletes the patient, appointments, notes, call and chat logs, intake forms, messages, email logs and callbacks.</p>
              <p>Kept: SMS opt-outs (so a STOP keeps working) and the audit trail. Clinical records may have a legal retention period — only erase when that does not apply. Export the data first if the patient asked for a copy.</p>
            </div>
            <div>
              <label className="block font-medium text-slate-900 dark:text-slate-100 mb-1.5">Type the patient&apos;s full name: <span className="font-mono">{fullName}</span></label>
              <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} disabled={busy} />
            </div>
            <div>
              <label className="block font-medium text-slate-900 dark:text-slate-100 mb-1.5">Reason / request reference</label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Pedido de apagamento por email de 17/10/2026, sem obrigação de conservação aplicável" disabled={busy} />
            </div>
            {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={erase} disabled={!nameMatches || reason.trim().length < 10 || busy} className="bg-red-600 hover:bg-red-700 text-white">
                {busy ? "Erasing…" : "Erase permanently"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
