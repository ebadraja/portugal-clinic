"use client";

import { LoadState } from "@/components/settings/shared";
import { IntegrationsGrid, useSystemStatus } from "@/components/settings/SystemStatusTab";

/** Real connection state of each integration (replaces the hard-coded "connected" cards). */
export function IntegrationsTab({ onOpenTab }: { onOpenTab: (tab: string) => void }) {
  const { data, loading, error, load } = useSystemStatus();
  if (!data) return <LoadState loading={loading} error={error} onRetry={load} />;
  return <IntegrationsGrid integrations={data.integrations} onOpenTab={onOpenTab} />;
}
