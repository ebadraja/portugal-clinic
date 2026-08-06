'use client'

import { cn } from '@/lib/utils'
import type { InboxFilter, SharedInboxSummary } from '@/types/messaging'

const BASE_TABS: { id: InboxFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'mine', label: 'My Inbox' },
]

const DEFAULT_INBOX_ORDER = ['Scheduling', 'Refills', 'Clinical', 'Billing']

function sortSharedInboxes(inboxes: SharedInboxSummary[]): SharedInboxSummary[] {
  return [...inboxes].sort((a, b) => {
    const aIndex = DEFAULT_INBOX_ORDER.indexOf(a.name)
    const bIndex = DEFAULT_INBOX_ORDER.indexOf(b.name)
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
    if (aIndex !== -1) return -1
    if (bIndex !== -1) return 1
    return a.name.localeCompare(b.name)
  })
}

interface InboxTabsProps {
  active: InboxFilter
  sharedInboxId: string | null
  sharedInboxes: SharedInboxSummary[]
  onChange: (inbox: InboxFilter, sharedInboxId?: string | null) => void
}

export function InboxTabs({
  active,
  sharedInboxId,
  sharedInboxes,
  onChange,
}: InboxTabsProps) {
  const sharedTabs = sortSharedInboxes(sharedInboxes)

  return (
    <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="flex gap-1 p-2 overflow-x-auto">
        {BASE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id, null)}
            className={cn(
              'shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              active === tab.id
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
            )}
          >
            {tab.label}
          </button>
        ))}
        {sharedTabs.map((inbox) => {
          const isActive = active === 'shared' && sharedInboxId === inbox.id
          return (
            <button
              key={inbox.id}
              type="button"
              onClick={() => onChange('shared', inbox.id)}
              className={cn(
                'shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
              )}
            >
              {inbox.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
