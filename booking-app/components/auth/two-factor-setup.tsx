"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendJson, useJson } from "@/components/settings/shared";

type Status = { enabled: boolean; pendingSetup: boolean; requiredByPolicy: boolean };

function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/** Set up / turn off two-factor sign-in (TOTP authenticator app). */
export function TwoFactorSetup({ onEnabled }: { onEnabled?: () => void }) {
  const { update } = useSession();
  const status = useJson<Status>("/api/account/2fa");
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    run(async () => {
      setSetup(await sendJson<{ secret: string; otpauthUri: string }>("/api/account/2fa", "POST", { action: "setup" }));
      setCode("");
    });

  const enable = () =>
    run(async () => {
      await sendJson("/api/account/2fa", "POST", { action: "enable", code });
      await update({ refreshTwoFactor: true });
      setSetup(null);
      setCode("");
      status.reload();
      onEnabled?.();
    });

  const disable = () =>
    run(async () => {
      await sendJson("/api/account/2fa", "POST", { action: "disable", password, code });
      await update({ refreshTwoFactor: true });
      setPassword("");
      setCode("");
      status.reload();
    });

  if (!status.data) {
    return status.error ? <p className="text-sm text-red-600">{status.error}</p> : <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (status.data.enabled) {
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <ShieldCheck className="h-5 w-5" />Two-factor sign-in is on. You&apos;ll be asked for a code from your authenticator app at each sign-in.
        </p>
        {status.data.requiredByPolicy ? (
          <p className="text-sm text-slate-500">Required for administrators by clinic policy. If you lose your phone, another administrator can reset it in Security &amp; Audit.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-slate-600 dark:text-slate-400">To turn it off, confirm your password and a current code.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Input type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <Input inputMode="numeric" placeholder="6-digit code" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
              <Button variant="outline" onClick={disable} disabled={busy || !password || code.length !== 6}>Turn off</Button>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Protects patient data if your password is ever stolen. You need an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password…).
        </p>
        <Button onClick={start} disabled={busy} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}Set up two-factor sign-in
        </Button>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="list-decimal pl-5 space-y-3 text-sm text-slate-700 dark:text-slate-300">
        <li>
          In your authenticator app, add an account by <strong>entering a setup key</strong> (choose “time-based”):
          <div className="mt-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 font-mono text-base tracking-wider select-all break-all">{groupSecret(setup.secret)}</div>
          <a href={setup.otpauthUri} className="mt-2 inline-block text-blue-600 dark:text-blue-400 hover:underline">On this phone? Tap here to open your authenticator app</a>
        </li>
        <li>
          Type the 6-digit code the app shows:
          <div className="mt-2 flex gap-2 max-w-xs">
            <Input inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            <Button onClick={enable} disabled={busy || code.length !== 6} className="bg-blue-600 hover:bg-blue-700">{busy ? "Checking…" : "Confirm"}</Button>
          </div>
        </li>
      </ol>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="button" onClick={() => setSetup(null)} className="text-sm text-slate-500 hover:underline">Cancel</button>
    </div>
  );
}
