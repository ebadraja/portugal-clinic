'use client'

import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { PracticeForm } from '@/lib/messaging/practiceForms'

interface FormPickerProps {
  conversationId: string | null | undefined
  disabled?: boolean
  onFormLinkSent?: () => void
}

export function FormPicker({ conversationId, disabled, onFormLinkSent }: FormPickerProps) {
  const [forms, setForms] = useState<PracticeForm[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sending, setSending] = useState(false)

  const loadForms = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true)
    } else {
      setInitialLoading(true)
    }

    try {
      const res = await fetch('/api/messaging/practice-forms', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setForms(data.data ?? [])
      }
    } finally {
      setInitialLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadForms()
  }, [loadForms])

  const sendForm = async (form: PracticeForm) => {
    if (!conversationId || sending || disabled) return

    setSending(true)
    try {
      const res = await fetch(`/api/messaging/conversations/${conversationId}/form-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId: form.id,
          formName: form.name,
          formDescription: form.description,
          formUrl: form.url,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      onFormLinkSent?.()
    } catch {
      // Parent may refresh on failure
    } finally {
      setSending(false)
    }
  }

  const emptyTooltip = 'No forms configured. Add forms in Settings → Patient Messaging.'
  const isDisabled = disabled || sending || !conversationId || forms.length === 0

  if (initialLoading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </div>
    )
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) void loadForms(true)
      }}
    >
      <DropdownMenuTrigger
        className="inline-flex"
        disabled={isDisabled}
        title={forms.length === 0 ? emptyTooltip : 'Send a practice form'}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs pointer-events-none"
          disabled={isDisabled}
          tabIndex={-1}
        >
          <ClipboardList className="h-3.5 w-3.5 mr-1" />
          {sending ? 'Sending…' : forms.length === 0 ? 'No forms' : 'Send form'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {refreshing && forms.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading forms…
          </div>
        ) : (
          forms.map((form) => (
            <DropdownMenuItem
              key={form.id}
              className="flex flex-col items-start gap-0.5 py-2"
              onClick={() => void sendForm(form)}
            >
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {form.name}
              </span>
              {form.description ? (
                <span className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                  {form.description}
                </span>
              ) : null}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
