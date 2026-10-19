"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/toast-provider";
import { useJson } from "@/components/settings/shared";
import type { ClinicSettingsDto } from "@/components/settings/clinic-types";

/** Loads /api/settings/clinic and saves one section at a time (PATCH with only that section). */
export function useClinicSettings() {
  const { showToast } = useToast();
  const { data, loading, error, reload: retry, setData } = useJson<ClinicSettingsDto>("/api/settings/clinic");
  const [savingSection, setSavingSection] = useState<string | null>(null);

  const save = useCallback(
    async (section: string, patch: Record<string, unknown>): Promise<boolean> => {
      setSavingSection(section);
      try {
        const res = await fetch("/api/settings/clinic", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(body.error ?? "Could not save", "error");
          return false;
        }
        setData((prev) => (prev ? { ...prev, ...body } : body));
        showToast("Saved", "success");
        return true;
      } catch {
        showToast("Network error — not saved", "error");
        return false;
      } finally {
        setSavingSection(null);
      }
    },
    [showToast, setData],
  );

  return { data, loading, error, reload: retry, save, savingSection };
}

/** Local editable copy of a value, with dirty tracking; resets when the source changes. */
export function useDraft<T>(source: T | undefined): [T | undefined, (v: T) => void, boolean, () => void] {
  const [draft, setDraft] = useState<T | undefined>(source);
  const [sourceKey, setSourceKey] = useState(() => JSON.stringify(source ?? null));
  const currentKey = JSON.stringify(source ?? null);
  if (currentKey !== sourceKey) {
    setSourceKey(currentKey);
    setDraft(source);
  }
  const dirty = JSON.stringify(draft ?? null) !== currentKey;
  return [draft, setDraft, dirty, () => setDraft(source)];
}
