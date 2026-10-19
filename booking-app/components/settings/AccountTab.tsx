"use client";

import { useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/components/theme-provider";
import { useToast } from "@/components/toast-provider";
import { LoadState, SectionCard, hintCls, inputCls, labelCls, sendJson, useJson } from "@/components/settings/shared";
import { useDraft } from "@/components/settings/use-clinic-settings";
import { TwoFactorSetup } from "@/components/auth/two-factor-setup";

type Profile = { id: string; firstName: string; lastName: string; email: string; phone: string | null; jobTitle: string | null; role: string };

export function AccountTab() {
  const { data: session, update: updateSession } = useSession();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const { data: profile, loading, error, reload: retry, setData: setProfile } = useJson<Profile>("/api/account/profile");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft, dirty] = useDraft(profile ? { firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone ?? "", jobTitle: profile.jobTitle ?? "" } : undefined);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file again re-triggers onChange
    e.target.value = "";
    if (!file) return;
    setAvatarError(null);
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
      setAvatarError("Use a PNG, JPG, WEBP, or GIF image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("Image must be 2MB or smaller.");
      return;
    }
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await fetch("/api/account/avatar", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setAvatarError(data.error || "Failed to upload avatar.");
        return;
      }
      // Refresh the session so the new avatar shows everywhere immediately
      await updateSession({ avatar: data.avatar });
    } catch {
      setAvatarError("Failed to upload avatar.");
    } finally {
      setAvatarUploading(false);
    }
  };

  const saveProfile = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const body = await sendJson<Profile>("/api/account/profile", "PATCH", { ...draft, phone: draft.phone || null, jobTitle: draft.jobTitle || null });
      setProfile(body);
      showToast("Profile saved. Your name updates in the sidebar at your next sign-in.", "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    setPwError(null);
    if (pw.next !== pw.confirm) {
      setPwError("The new passwords do not match.");
      return;
    }
    setPwBusy(true);
    try {
      await sendJson("/api/account/password", "POST", { currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: "", next: "", confirm: "" });
      showToast("Password changed", "success");
    } catch (e) {
      setPwError((e as Error).message);
    } finally {
      setPwBusy(false);
    }
  };

  if (!profile || !draft) return <LoadState loading={loading} error={error} onRetry={retry} />;

  return (
    <div className="space-y-6">
      <SectionCard title="Profile" onSave={saveProfile} saving={saving} dirty={dirty}>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-lg bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl font-semibold overflow-hidden">
            {session?.user?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.user.avatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              [profile.firstName[0], profile.lastName[0]].filter(Boolean).join("").toUpperCase() || "?"
            )}
          </div>
          <div>
            <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleAvatarChange} />
            <Button variant="outline" size="sm" disabled={avatarUploading} onClick={() => avatarInputRef.current?.click()}>
              {avatarUploading ? "Uploading…" : "Change avatar"}
            </Button>
            {avatarError && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{avatarError}</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className={labelCls}>First name</label><Input value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} className={inputCls} /></div>
          <div><label className={labelCls}>Last name</label><Input value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} className={inputCls} /></div>
          <div>
            <label className={labelCls}>Email</label>
            <Input value={profile.email} disabled className={inputCls} />
            <p className={hintCls}>Changed by an administrator in Staff.</p>
          </div>
          <div><label className={labelCls}>Phone</label><Input type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className={inputCls} /></div>
          <div><label className={labelCls}>Job title</label><Input value={draft.jobTitle} onChange={(e) => setDraft({ ...draft, jobTitle: e.target.value })} className={inputCls} /></div>
          <div><label className={labelCls}>Role</label><Input value={profile.role} disabled className={inputCls} /></div>
        </div>
      </SectionCard>

      <SectionCard title="Change password" description="At least 10 characters, mixing letters with numbers or symbols.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><label className={labelCls}>Current password</label><Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className={inputCls} /></div>
          <div><label className={labelCls}>New password</label><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className={inputCls} /></div>
          <div><label className={labelCls}>Confirm new password</label><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} className={inputCls} /></div>
        </div>
        {pwError && <p className="text-sm text-red-600 dark:text-red-400">{pwError}</p>}
        <div className="flex justify-end">
          <Button size="sm" onClick={changePassword} disabled={pwBusy || !pw.current || !pw.next || !pw.confirm} className="bg-blue-600 hover:bg-blue-700 gap-1.5">
            {pwBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Update password
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Two-factor sign-in" description="A code from your phone at each sign-in, in addition to your password.">
        <TwoFactorSetup />
      </SectionCard>

      <SectionCard title="Preferences" description="Dates and times are shown in the clinic's time zone (Practice Information).">
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={theme === "dark"} onChange={toggleTheme} className="rounded accent-blue-600" />
          Dark mode (this browser)
        </label>
      </SectionCard>
    </div>
  );
}
