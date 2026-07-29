'use client'

import { useEffect, useState } from 'react'
import { Stethoscope } from 'lucide-react'

interface PortalBranding {
  practiceName: string
  practicePhone: string | null
  practiceTagline: string | null
}

export function PortalHeader() {
  const [branding, setBranding] = useState<PortalBranding>({
    practiceName: 'Kids 0-18 Integrated Pediatrics',
    practicePhone: null,
    practiceTagline: null,
  })

  useEffect(() => {
    fetch('/api/portal/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.practiceName) setBranding(data)
      })
      .catch(() => {})
  }, [])

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur px-4 py-3">
      <div className="max-w-lg mx-auto flex items-center gap-3">
        <div className="bg-blue-600 p-2 rounded-lg shrink-0">
          <Stethoscope className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="font-semibold text-sm text-slate-900 dark:text-slate-50 truncate">
            {branding.practiceName}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {branding.practiceTagline ?? 'Patient messaging portal'}
            {branding.practicePhone ? ` · ${branding.practicePhone}` : ''}
          </p>
        </div>
      </div>
    </header>
  )
}
