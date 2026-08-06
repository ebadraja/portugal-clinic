'use client'

import { use } from 'react'
import { PortalMagicLink } from '@/components/portal/PortalMagicLink'

export default function PortalMagicLinkPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = use(params)
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-8">
      <PortalMagicLink token={token} />
    </div>
  )
}
