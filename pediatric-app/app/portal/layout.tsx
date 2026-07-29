import type { Metadata } from 'next'
import { PortalHeader } from '@/components/portal/PortalHeader'

export const metadata: Metadata = {
  title: 'Patient Portal — Kids 0-18',
  description: 'Secure patient messaging portal',
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      <PortalHeader />
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  )
}
