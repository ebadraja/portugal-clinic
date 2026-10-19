"use client";

import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

const KEY = "crm-last-activity";
const WARN_MS = 60_000;
const EVENTS = ["mousedown", "keydown", "touchstart", "scroll", "wheel"] as const;

function readLast(): number {
  try {
    return Number(localStorage.getItem(KEY)) || Date.now();
  } catch {
    return Date.now();
  }
}

function writeLast(t: number) {
  try {
    localStorage.setItem(KEY, String(t));
  } catch {
    // storage blocked: this tab still tracks its own activity
  }
}

/**
 * Signs staff out after the clinic's inactivity limit (Settings → Security & Audit).
 * Activity = keyboard/mouse/touch, shared across tabs, so background polling
 * doesn't keep an unattended screen signed in. Warns one minute before.
 */
export function IdleLogout() {
  const { data: session, status } = useSession();
  const idleMs = (session?.user?.idleMinutes ?? 30) * 60_000;
  const [warning, setWarning] = useState<number | null>(null);
  const lastWrite = useRef(0);
  const signingOut = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    const mark = () => {
      const now = Date.now();
      if (now - lastWrite.current < 5_000) return;
      lastWrite.current = now;
      writeLast(now);
      setWarning(null);
    };
    writeLast(Date.now());
    EVENTS.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const timer = setInterval(() => {
      const left = readLast() + idleMs - Date.now();
      if (left <= 0 && !signingOut.current) {
        signingOut.current = true;
        void signOut({ callbackUrl: "/login?timeout=1" });
      } else if (left <= WARN_MS) {
        setWarning(Math.max(0, Math.ceil(left / 1000)));
      } else {
        setWarning(null);
      }
    }, 5_000);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, mark));
      clearInterval(timer);
    };
  }, [status, idleMs]);

  if (warning === null) return null;
  return (
    <div role="alertdialog" aria-live="assertive" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950 p-4 shadow-lg">
      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">You&apos;ll be signed out in about {warning} s because of inactivity.</p>
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={() => { writeLast(Date.now()); setWarning(null); }}>Stay signed in</Button>
      </div>
    </div>
  );
}
