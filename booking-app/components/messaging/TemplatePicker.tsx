'use client'

import { useEffect, useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { MessageTemplateSummary } from '@/types/messaging'

interface TemplatePickerProps {
  patientId: string | null
  disabled?: boolean
  onInsert: (content: string) => void
}

export function TemplatePicker({ patientId, disabled, onInsert }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<MessageTemplateSummary[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(false)
  const [inserting, setInserting] = useState(false)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/messaging/templates')
        if (res.ok) {
          const data = await res.json()
          setTemplates(data.data ?? [])
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleInsert = async () => {
    if (!selectedId || !patientId || inserting) return
    setInserting(true)
    try {
      const res = await fetch(
        `/api/messaging/templates/${selectedId}?preview=true&patientId=${encodeURIComponent(patientId)}`,
      )
      if (!res.ok) throw new Error('Failed to load template')
      const data = await res.json()
      onInsert(data.previewBody ?? data.body ?? '')
      setSelectedId('')
    } catch {
      // Fallback to raw template body
      const template = templates.find((t) => t.id === selectedId)
      if (template) onInsert(template.body)
    } finally {
      setInserting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading templates...
      </div>
    )
  }

  if (templates.length === 0) return null

  return (
    <div className="flex gap-2 items-center mb-2">
      <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      <Select value={selectedId} onValueChange={(v) => setSelectedId(v ?? '')} disabled={disabled}>
        <SelectTrigger className="h-8 text-xs flex-1">
          <SelectValue placeholder="Insert template..." />
        </SelectTrigger>
        <SelectContent>
          {templates.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.category} — {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 text-xs shrink-0"
        disabled={disabled || !selectedId || !patientId || inserting}
        onClick={() => void handleInsert()}
      >
        Insert
      </Button>
    </div>
  )
}
