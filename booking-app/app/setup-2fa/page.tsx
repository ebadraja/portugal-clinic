"use client";

import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { ShieldAlert } from "lucide-react";
import { TwoFactorSetup } from "@/components/auth/two-factor-setup";

// Standalone (no sidebar): while clinic policy requires two-factor and it isn't set up,
// proxy.ts sends administrators here and blocks every other page and API.
export default function SetupTwoFactorPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Set up two-factor sign-in</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              The clinic requires two-factor sign-in for administrators. Set it up to continue to the CRM.
            </p>
          </div>
        </div>
        <TwoFactorSetup
          onEnabled={() => {
            router.replace("/dashboard");
            router.refresh();
          }}
        />
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
          <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="text-sm text-slate-500 hover:underline">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
