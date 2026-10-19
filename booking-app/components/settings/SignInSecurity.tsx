"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/toast-provider";
import { LoadState, SectionCard, hintCls, labelCls, selectCls, sendJson, useJson } from "@/components/settings/shared";

type Staff = { id: string; firstName: string; lastName: string; email: string; role: string; isActive: boolean; twoFactorEnabled: boolean };
type Security = { requireAdmin2fa: boolean; idleMinutes: number; allowedIdleMinutes: number[]; staff: Staff[] };

export function SignInSecurity() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const sec = useJson<Security>("/api/settings/security", { forbiddenMessage: "Only administrators can change sign-in security." });
  const [saving, setSaving] = useState(false);
  const [confirmRequire, setConfirmRequire] = useState(false);
  const [resetting, setResetting] = useState<Staff | null>(null);

  if (!sec.data) return <LoadState loading={sec.loading} error={sec.error} onRetry={sec.reload} />;
  const data = sec.data;
  const me = data.staff.find((s) => s.id === session?.user?.id);
  const adminsWithout = data.staff.filter((s) => s.role === "ADMIN" && s.isActive && !s.twoFactorEnabled);

  const save = async (patch: Partial<Pick<Security, "requireAdmin2fa" | "idleMinutes">>) => {
    setSaving(true);
    try {
      sec.setData(await sendJson<Security>("/api/settings/security", "PATCH", patch));
      showToast("Saved", "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const reset2fa = async () => {
    if (!resetting) return;
    try {
      const r = await sendJson<{ message: string }>(`/api/staff/${resetting.id}`, "PUT", { action: "reset_2fa" });
      showToast(r.message, "success");
      setResetting(null);
      sec.reload();
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  return (
    <SectionCard title="Sign-in security" description="Applies to every staff account. Changes take effect within a minute.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label className={labelCls}>Sign out after inactivity</label>
          <select value={data.idleMinutes} disabled={saving} onChange={(e) => save({ idleMinutes: Number(e.target.value) })} className={selectCls}>
            {data.allowedIdleMinutes.map((m) => (
              <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}`}</option>
            ))}
          </select>
          <p className={hintCls}>Staff are warned a minute before. Every sign-in also ends after 12 hours.</p>
        </div>
        <div>
          <label className={labelCls}>Two-factor sign-in for administrators</label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={data.requireAdmin2fa}
              disabled={saving}
              onChange={(e) => (e.target.checked ? setConfirmRequire(true) : save({ requireAdmin2fa: false }))}
              className="rounded accent-blue-600"
            />
            Required
          </label>
          <p className={hintCls}>Administrators without it are sent to set it up before they can use the CRM.</p>
        </div>
      </div>

      <div>
        <p className={labelCls}>Who uses two-factor</p>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.staff.map((s) => (
            <li key={s.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-slate-800 dark:text-slate-200">
                {s.firstName} {s.lastName} <span className="text-xs text-slate-500">· {s.role}{s.isActive ? "" : " · inactive"}</span>
              </span>
              <span className="flex items-center gap-3">
                {s.twoFactorEnabled ? (
                  <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><ShieldCheck className="h-4 w-4" />On</span>
                ) : (
                  <span className="flex items-center gap-1 text-slate-500"><ShieldOff className="h-4 w-4" />Off</span>
                )}
                {s.twoFactorEnabled && s.id !== session?.user?.id && (
                  <Button size="sm" variant="ghost" onClick={() => setResetting(s)}>Reset (lost phone)</Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Dialog open={confirmRequire} onOpenChange={setConfirmRequire}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Require two-factor for administrators?</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            {adminsWithout.length > 0 ? (
              <p>These administrators will have to set it up at their next page load: {adminsWithout.map((a) => `${a.firstName} ${a.lastName}`).join(", ")}.</p>
            ) : (
              <p>All active administrators already use two-factor.</p>
            )}
            {me && !me.twoFactorEnabled && <p className="font-medium text-amber-700 dark:text-amber-400">That includes you — you&apos;ll be asked to set it up right away.</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmRequire(false)}>Cancel</Button>
            <Button onClick={() => { setConfirmRequire(false); void save({ requireAdmin2fa: true }); }} className="bg-blue-600 hover:bg-blue-700">Require it</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetting} onOpenChange={(o) => { if (!o) setResetting(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Reset two-factor for {resetting?.firstName} {resetting?.lastName}?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600 dark:text-slate-300">Use this only when they have lost or replaced their phone. They&apos;ll sign in with their password and set up two-factor again.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setResetting(null)}>Cancel</Button>
            <Button onClick={reset2fa} className="bg-amber-600 hover:bg-amber-700">Reset</Button>
          </div>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
