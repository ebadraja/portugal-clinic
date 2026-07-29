import { redirect } from 'next/navigation'
import { PortalAuth } from '@/components/portal/PortalAuth'
import { getPortalSessionFromCookies } from '@/lib/messaging/portalAuth'

export default async function PortalLoginPage() {
  const session = await getPortalSessionFromCookies()
  if (session) {
    redirect('/portal/chat')
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-8">
      <PortalAuth />
    </div>
  )
}
