'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { StaffOption } from '@/types/messaging'

interface AssignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAssign: (assignedToId: string | null, reason?: string) => Promise<void>
}

export function AssignmentDialog({ open, onOpenChange, onAssign }: AssignmentDialogProps) {
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/messaging/staff')
      .then((r) => r.json())
      .then((data) => setStaff(data.data ?? []))
      .catch(() => setStaff([]))
      .finally(() => setLoading(false))
  }, [open])

  const handleSubmit = async () => {
    if (!selectedId) return
    setSubmitting(true)
    try {
      await onAssign(selectedId, reason.trim() || undefined)
      onOpenChange(false)
      setReason('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign conversation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="assignee">Staff member</Label>
            <Select
              value={selectedId}
              onValueChange={(v) => setSelectedId(v ?? '')}
              disabled={loading}
            >
              <SelectTrigger id="assignee">
                <SelectValue placeholder={loading ? 'Loading staff...' : 'Select staff member'} />
              </SelectTrigger>
              <SelectContent>
                {staff.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.firstName} {user.lastName} ({user.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assign-reason">Note for next assignee (optional)</Label>
            <Textarea
              id="assign-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Context for the person taking over..."
              className="min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!selectedId || submitting}>
            {submitting ? 'Assigning...' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
