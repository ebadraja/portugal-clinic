"use client"

import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format, addMinutes, startOfDay } from "date-fns"
import { Search, Loader2, CheckCircle2, AlertCircle, X, User } from "lucide-react"

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/toast-provider"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatientOption {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string
  phone: string | null
}

interface AvailabilitySlot {
  startTime: string
  endTime: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const APPOINTMENT_TYPES = [
  { value: "WELL_CHILD_VISIT", label: "Well-child Visit" },
  { value: "SICK_VISIT",       label: "Sick Visit" },
  { value: "VACCINATION",      label: "Vaccination" },
  { value: "FOLLOW_UP",        label: "Follow-up" },
  { value: "CONSULTATION",     label: "Consultation" },
  { value: "PROCEDURE",        label: "Procedure" },
  { value: "OTHER",            label: "Other" },
]

const PROVIDERS = [
  { value: "Dr. Jonathan Tamas",   label: "Dr. Jonathan Tamas" },
  { value: "Dr. Peaches Richards", label: "Dr. Peaches Richards" },
]

const DURATIONS = [
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "45", label: "45 minutes" },
  { value: "60", label: "60 minutes" },
]

const TODAY_STR = format(new Date(), "yyyy-MM-dd")

// ─── Zod schema ───────────────────────────────────────────────────────────────

const formSchema = z.object({
  patientId: z.string().min(1, "Patient is required"),
  type:      z.string().min(1, "Appointment type is required"),
  provider:  z.string().min(1, "Provider is required"),
  startDate: z
    .string()
    .min(1, "Date is required")
    .refine(
      (v) => new Date(v + "T00:00:00") >= startOfDay(new Date()),
      "Date cannot be in the past",
    ),
  startTime: z.string().min(1, "Time is required"),
  duration:  z.string().min(1, "Duration is required"),
  reason:    z.string().optional(),
  notes:     z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

// ─── PatientCombobox ──────────────────────────────────────────────────────────
// Renders the dropdown via createPortal so it escapes the dialog's
// overflow-y-auto scroll container and never collides with form fields below.

interface PatientComboboxProps {
  value: string
  onChange: (id: string) => void
  defaultPatientId?: string
  error?: boolean
}

function PatientCombobox({ onChange, defaultPatientId, error }: PatientComboboxProps) {
  const [query,     setQuery]     = useState("")
  const [results,   setResults]   = useState<PatientOption[]>([])
  const [selected,  setSelected]  = useState<PatientOption | null>(null)
  const [open,      setOpen]      = useState(false)
  const [searching, setSearching] = useState(false)
  const [rect,      setRect]      = useState<DOMRect | null>(null)
  const triggerRef                = useRef<HTMLDivElement>(null)
  const dropdownRef               = useRef<HTMLDivElement>(null)
  const inputRef                  = useRef<HTMLInputElement>(null)

  // Measure trigger position whenever dropdown opens / page scrolls
  useEffect(() => {
    if (!open) return
    const measure = () => {
      if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect())
    }
    measure()
    window.addEventListener("scroll",  measure, true)
    window.addEventListener("resize",  measure)
    return () => {
      window.removeEventListener("scroll",  measure, true)
      window.removeEventListener("resize",  measure)
    }
  }, [open])

  // Pre-fill when defaultPatientId provided
  useEffect(() => {
    if (!defaultPatientId) return
    fetch(`/api/patients/${defaultPatientId}`)
      .then((r) => r.json())
      .then((p: PatientOption) => { setSelected(p); onChange(p.id) })
      .catch(() => {})
  }, [defaultPatientId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search on query change
  useEffect(() => {
    if (!open) return
    if (!query.trim()) { setResults([]); return }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/patients?search=${encodeURIComponent(query)}&limit=8`)
        const json = await res.json()
        setResults(json.data ?? [])
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, open])

  // Load initial list when opening with no query
  useEffect(() => {
    if (!open || query.trim()) return
    setSearching(true)
    fetch("/api/patients?limit=8&sortBy=lastName&sortOrder=asc")
      .then((r) => r.json())
      .then((j) => setResults(j.data ?? []))
      .catch(() => setResults([]))
      .finally(() => setSearching(false))
  }, [open, query])

  // Close on click outside — must cover both the trigger AND the portal node
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || dropdownRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const select = (patient: PatientOption) => {
    setSelected(patient)
    onChange(patient.id)
    setOpen(false)
    setQuery("")
  }

  const clear = () => {
    setSelected(null)
    onChange("")
    setQuery("")
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  return (
    <>
      {/* ── Trigger ── */}
      <div ref={triggerRef}>
        {selected ? (
          <div className={cn(
            "flex items-center gap-2 h-8 px-2.5 rounded-lg border bg-transparent text-sm",
            error ? "border-destructive" : "border-input",
          )}>
            <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="flex-1 truncate text-foreground">
              {selected.firstName} {selected.lastName}
            </span>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              DOB {format(new Date(selected.dateOfBirth), "MM/dd/yyyy")}
            </span>
            <button type="button" onClick={clear}
              className="ml-1 rounded hover:bg-muted p-0.5 transition-colors flex-shrink-0">
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className={cn(
            "flex items-center gap-2 h-8 px-2.5 rounded-lg border bg-transparent transition-colors",
            error ? "border-destructive" : "border-input",
            open  && "border-ring ring-3 ring-ring/50",
          )}>
            {searching
              ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground flex-shrink-0" />
              : <Search  className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            }
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setOpen(true)}
              placeholder="Search patient by name or phone…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-0"
            />
          </div>
        )}
      </div>

      {/* ── Portal dropdown — escapes the dialog's overflow container ── */}
      {open && !selected && rect && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top:   rect.bottom + 4,
              left:  rect.left,
              width: rect.width,
              zIndex: 9999,
            }}
            className="rounded-lg border border-input bg-popover text-popover-foreground shadow-lg overflow-hidden"
          >
            {searching ? (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching…
              </div>
            ) : results.length === 0 ? (
              <p className="py-3 px-3 text-sm text-muted-foreground text-center">
                {query.trim() ? "No patients found" : "Start typing to search"}
              </p>
            ) : (
              <ul className="max-h-52 overflow-y-auto divide-y divide-border">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); select(p) }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted flex-shrink-0">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {p.firstName} {p.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          DOB {format(new Date(p.dateOfBirth), "MM/dd/yyyy")}
                          {p.phone && ` · ${p.phone}`}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )
      }
    </>
  )
}

// ─── AvailabilityStatus ───────────────────────────────────────────────────────

type AvailStatus = "checking" | "available" | "booked" | null

function AvailabilityStatus({ status }: { status: AvailStatus }) {
  if (!status) return null
  return (
    <div className={cn(
      "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md",
      status === "checking"  && "bg-muted text-muted-foreground",
      status === "available" && "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
      status === "booked"    && "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300",
    )}>
      {status === "checking"  && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === "available" && <CheckCircle2 className="h-3 w-3" />}
      {status === "booked"    && <AlertCircle className="h-3 w-3" />}
      <span>
        {status === "checking"  && "Checking availability…"}
        {status === "available" && "This slot is available"}
        {status === "booked"    && "Already booked — choose another time"}
      </span>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AddAppointmentDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  defaultDate?: Date
  defaultPatientId?: string
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AddAppointmentDialog({
  isOpen,
  onClose,
  onSuccess,
  defaultDate,
  defaultPatientId,
}: AddAppointmentDialogProps) {
  const { showToast }                         = useToast()
  const [submitting,  setSubmitting]          = useState(false)
  const [availStatus, setAvailStatus]         = useState<AvailStatus>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      patientId: "",
      type:      "",
      provider:  "",
      startDate: defaultDate ? format(defaultDate, "yyyy-MM-dd") : "",
      startTime: "",
      duration:  "30",
      reason:    "",
      notes:     "",
    },
  })

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      form.reset({
        patientId: "",
        type:      "",
        provider:  "",
        startDate: defaultDate ? format(defaultDate, "yyyy-MM-dd") : "",
        startTime: "",
        duration:  "30",
        reason:    "",
        notes:     "",
      })
      setAvailStatus(null)
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Availability check ──────────────────────────────────────────────────────

  const watchDate     = form.watch("startDate")
  const watchTime     = form.watch("startTime")
  const watchProvider = form.watch("provider")
  const watchDuration = form.watch("duration")

  useEffect(() => {
    if (!watchDate || !watchTime || !watchProvider || !watchDuration) {
      setAvailStatus(null)
      return
    }
    setAvailStatus("checking")
    const timer = setTimeout(async () => {
      try {
        const p = new URLSearchParams({
          date:     watchDate,
          duration: watchDuration,
          provider: watchProvider,
        })
        const res  = await fetch(`/api/appointments/availability?${p}`)
        const json = await res.json()
        const slots: AvailabilitySlot[] = json.availableSlots ?? []
        setAvailStatus(slots.some((s) => s.startTime === watchTime) ? "available" : "booked")
      } catch {
        setAvailStatus(null)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [watchDate, watchTime, watchProvider, watchDuration])

  // ── Submit ──────────────────────────────────────────────────────────────────

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true)
    try {
      const start   = new Date(`${values.startDate}T${values.startTime}:00`)
      const end     = addMinutes(start, parseInt(values.duration, 10))
      const payload = {
        patientId: values.patientId,
        startTime: start.toISOString(),
        endTime:   end.toISOString(),
        duration:  parseInt(values.duration, 10),
        type:      values.type,
        provider:  values.provider,
        reason:    values.reason  || null,
        notes:     values.notes   || null,
        bookedVia: "STAFF",
      }

      const res = await fetch("/api/appointments", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showToast(
          res.status === 409
            ? (err.error ?? "A conflicting appointment exists for this time slot.")
            : (err.error ?? "Failed to create appointment."),
          "error",
        )
        return
      }

      showToast("Appointment scheduled successfully!", "success")
      onClose()
      onSuccess()
    } catch {
      showToast("Something went wrong. Please try again.", "error")
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule Appointment</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-1">

            {/* ── Patient ──────────────────────────────────────────────────── */}
            <FormField
              control={form.control}
              name="patientId"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Patient <span className="text-destructive">*</span></FormLabel>
                  <PatientCombobox
                    value={field.value}
                    onChange={field.onChange}
                    defaultPatientId={defaultPatientId}
                    error={!!fieldState.error}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Type + Provider ───────────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type <span className="text-destructive">*</span></FormLabel>
                    <Select value={field.value || ""} onValueChange={(value) => {
                      if (value) field.onChange(value);
                    }}>
                      <SelectTrigger className="w-full h-8">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {APPOINTMENT_TYPES.map(({ value, label }) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider <span className="text-destructive">*</span></FormLabel>
                    <Select value={field.value || ""} onValueChange={(value) => {
                      if (value) field.onChange(value);
                    }}>
                      <SelectTrigger className="w-full h-8">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {PROVIDERS.map(({ value, label }) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ── Date + Time ───────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input type="date" min={TODAY_STR} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ── Duration + Availability badge ─────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <FormItem className="sm:w-48 flex-shrink-0">
                    <FormLabel>Duration <span className="text-destructive">*</span></FormLabel>
                    <Select value={field.value || ""} onValueChange={(value) => {
                      if (value) field.onChange(value);
                    }}>
                      <SelectTrigger className="w-full h-8">
                        <SelectValue placeholder="Duration" />
                      </SelectTrigger>
                      <SelectContent>
                        {DURATIONS.map(({ value, label }) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {availStatus && (
                <div className="sm:pb-0.5">
                  <AvailabilityStatus status={availStatus} />
                </div>
              )}
            </div>

            {/* ── Reason ────────────────────────────────────────────────────── */}
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for visit</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g., Annual well-child checkup, fever for 2 days…"
                      className="min-h-[72px] resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Notes ─────────────────────────────────────────────────────── */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Notes{" "}
                    <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any additional notes for the care team…"
                      className="min-h-[60px] resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Footer ────────────────────────────────────────────────────── */}
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || availStatus === "booked"}
                className="min-w-[140px]"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? "Scheduling…" : "Schedule Appointment"}
              </Button>
            </div>

          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
