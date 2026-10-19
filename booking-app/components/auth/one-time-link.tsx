'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, Copy, KeyRound } from 'lucide-react';

/** Shows a set-password link once, with copy. Used when email delivery isn't configured. */
export function OneTimeLink({ url, expiresAt }: { url: string; expiresAt?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40">
      <p className="flex items-center gap-2 text-sm font-medium text-blue-900 dark:text-blue-200">
        <KeyRound className="h-4 w-4" />
        One-time set-password link
      </p>
      <p className="text-xs text-blue-800 dark:text-blue-300">
        Email isn&apos;t configured, so send this link to the person yourself (not in a group chat). It works once
        {expiresAt ? ` and expires ${new Date(expiresAt).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}` : ''}.
        It will not be shown again.
      </p>
      <div className="flex gap-2">
        <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-9 bg-white font-mono text-xs dark:bg-slate-900" />
        <Button type="button" size="sm" variant="outline" onClick={copy} className="h-9 shrink-0 gap-1">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}
