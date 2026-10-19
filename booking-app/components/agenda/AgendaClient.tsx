"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

// The agenda is fully client-driven (it fetches its own data and reads browser preferences),
// so it is not server-rendered.
export const AgendaClient = dynamic(() => import("./AgendaPage").then((m) => m.AgendaPage), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  ),
})
