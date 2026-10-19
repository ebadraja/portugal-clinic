"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertCircle, CheckCircle, Info, Loader2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const labelCls = "block text-sm font-medium text-slate-900 dark:text-slate-100 mb-1.5";
export const inputCls = "dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100";
export const selectCls =
  "w-full h-9 px-3 border border-slate-300 dark:border-slate-600 rounded-md text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:opacity-60";
export const hintCls = "text-xs text-slate-500 dark:text-slate-400 mt-1";

export function useIsAdmin(): boolean {
  const { data } = useSession();
  return data?.user?.role === "ADMIN";
}

export function SectionCard({
  title,
  description,
  children,
  onSave,
  saving,
  dirty,
  canEdit = true,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  onSave?: () => void;
  saving?: boolean;
  dirty?: boolean;
  canEdit?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <Card className="dark:bg-slate-900 dark:border-slate-700">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div>
            <CardTitle className="dark:text-slate-50">{title}</CardTitle>
            {description && <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</div>}
          </div>
          {actions}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        {onSave && canEdit && (
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            {dirty && !saving && <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>}
            <Button size="sm" onClick={onSave} disabled={saving || dirty === false} className="bg-blue-600 hover:bg-blue-700 gap-1.5">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function LoadState({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-10 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</span>
        <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button>
      </div>
    );
  }
  return null;
}

export function ReadOnlyNotice() {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 p-3 text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
      <Info className="h-4 w-4 shrink-0" />Only administrators can change these settings.
    </div>
  );
}

export function StatusIcon({ status }: { status: "ok" | "warn" | "fail" | "info" }) {
  if (status === "ok") return <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />;
  if (status === "fail") return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />;
  if (status === "warn") return <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />;
  return <Info className="h-4 w-4 text-slate-500 shrink-0" />;
}

/** PATCH helper returning the parsed body or throwing the server's error message. */
export async function sendJson<T = unknown>(url: string, method: "PATCH" | "POST" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

async function fetchJson<T>(url: string, forbiddenMessage?: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 403 && forbiddenMessage) throw new Error(forbiddenMessage);
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

/**
 * GET a JSON endpoint with loading/error state. Re-fetches when `url` changes;
 * `reload()` fetches again. Responses that arrive after unmount or after the URL
 * changed are ignored.
 */
export function useJson<T>(url: string | null, opts: { forbiddenMessage?: string } = {}) {
  const { forbiddenMessage } = opts;
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!url) return;
    let ignore = false;
    fetchJson<T>(url, forbiddenMessage).then(
      (data) => {
        if (!ignore) setState({ data, loading: false, error: null });
      },
      (e: Error) => {
        if (!ignore) setState((s) => ({ ...s, loading: false, error: e.message }));
      },
    );
    return () => {
      ignore = true;
    };
  }, [url, nonce, forbiddenMessage]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setNonce((n) => n + 1);
  }, []);

  const setData = useCallback((next: T | null | ((prev: T | null) => T | null)) => {
    setState((s) => ({ ...s, data: typeof next === "function" ? (next as (p: T | null) => T | null)(s.data) : next }));
  }, []);

  return { ...state, reload, setData };
}
