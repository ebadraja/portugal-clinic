"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Calendar,
} from "lucide-react";

interface AddAppointmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment?: AppointmentData;
  onAppointmentSaved?: (appointment: AppointmentData) => void;
}

interface AppointmentData {
  id?: string;
  patientName: string;
  patientPhone: string;
  appointmentDate: string;
  appointmentTime: string;
  appointmentType: string;
  duration?: number;
  provider: string;
  reason: string;
  notes: string;
  status: string;
}

interface FormErrors {
  [key: string]: string;
}

const INITIAL_APPOINTMENT: AppointmentData = {
  patientName: "",
  patientPhone: "",
  appointmentDate: "",
  appointmentTime: "",
  appointmentType: "WELL_CHILD_VISIT",
  duration: 30,
  provider: "Dr. Jonathan Tamas",
  reason: "",
  notes: "",
  status: "SCHEDULED",
};

const APPOINTMENT_TYPES = [
  { id: "WELL_CHILD_VISIT", label: "Well-child Visit" },
  { id: "SICK_VISIT",       label: "Sick Visit" },
  { id: "VACCINATION",      label: "Vaccination" },
  { id: "FOLLOW_UP",        label: "Follow-up" },
  { id: "CONSULTATION",     label: "Consultation" },
  { id: "PROCEDURE",        label: "Procedure" },
  { id: "OTHER",            label: "Other" },
];

const PROVIDERS = [
  { id: "Dr. Jonathan Tamas",   label: "Dr. Jonathan Tamas" },
  { id: "Dr. Peaches Richards", label: "Dr. Peaches Richards" },
];

const STATUSES = [
  { id: "SCHEDULED",   label: "Scheduled" },
  { id: "CONFIRMED",   label: "Confirmed" },
  { id: "COMPLETED",   label: "Completed" },
  { id: "CANCELLED",   label: "Cancelled" },
  { id: "NO_SHOW",     label: "No-show" },
  { id: "RESCHEDULED", label: "Rescheduled" },
];

export default function AddAppointmentModal({
  open,
  onOpenChange,
  appointment,
  onAppointmentSaved,
}: AddAppointmentModalProps) {
  const [formData, setFormData] = useState<AppointmentData>(INITIAL_APPOINTMENT);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (appointment && open) {
      setFormData(appointment);
    } else if (open) {
      setFormData(INITIAL_APPOINTMENT);
    }
  }, [appointment, open]);

  const validateField = (fieldName: string, value: string): string | null => {
    const now = new Date();

    switch (fieldName) {
      case "patientName":
        if (!value.trim()) return "Patient name is required";
        if (value.length > 100) return "Patient name must be 100 characters or less";
        return null;

      case "patientPhone":
        if (!value) return "Patient phone is required";
        const phoneRegex = /^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/;
        if (!phoneRegex.test(value.replace(/\s/g, "")))
          return "Phone must be in format: (555) 123-4567";
        return null;

      case "appointmentDate":
        if (!value) return "Appointment date is required";
        const dateObj = new Date(value);
        if (isNaN(dateObj.getTime())) return "Invalid date format";
        if (dateObj < now) return "Appointment date cannot be in the past";
        return null;

      case "appointmentTime":
        if (!value) return "Appointment time is required";
        const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(value)) return "Time must be in HH:MM format (24-hour)";
        return null;

      case "appointmentType":
        if (!value) return "Appointment type is required";
        return null;

      case "provider":
        if (!value) return "Provider is required";
        return null;

      case "reason":
        if (!value.trim()) return "Reason for visit is required";
        if (value.length > 200) return "Reason must be 200 characters or less";
        return null;

      default:
        return null;
    }
  };

  const handleFieldChange = (fieldName: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [fieldName]: value,
    }));

    if (errors[fieldName]) {
      const error = validateField(fieldName, value);
      setErrors((prev) => {
        const newErrors = { ...prev };
        if (error) {
          newErrors[fieldName] = error;
        } else {
          delete newErrors[fieldName];
        }
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    const requiredFields = [
      "patientName",
      "patientPhone",
      "appointmentDate",
      "appointmentTime",
      "appointmentType",
      "provider",
      "reason",
    ];

    requiredFields.forEach((fieldName) => {
      const value = String(formData[fieldName as keyof AppointmentData] ?? "");
      const error = validateField(fieldName, value);
      if (error) {
        newErrors[fieldName] = error;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const start    = new Date(`${formData.appointmentDate}T${formData.appointmentTime}:00`);
      const duration = formData.duration ?? 30;
      const end      = new Date(start.getTime() + duration * 60_000);

      if (formData.id) {
        const res = await fetch(`/api/appointments/${formData.id}`, {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startTime: start.toISOString(),
            endTime:   end.toISOString(),
            type:      formData.appointmentType,
            status:    formData.status,
            provider:  formData.provider,
            reason:    formData.reason   || null,
            notes:     formData.notes    || null,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err.error ?? "Failed to update appointment");
          return;
        }
      }

      setIsLoading(false);
      setSubmitted(true);
      if (onAppointmentSaved) onAppointmentSaved(formData);
      setTimeout(() => handleReset(), 2000);
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setFormData(INITIAL_APPOINTMENT);
    setErrors({});
    setSubmitted(false);
    onOpenChange(false);
  };

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={handleReset}>
        <DialogContent className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle>
              {appointment ? "Appointment Updated" : "Appointment Scheduled"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 flex flex-col items-center gap-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-600" />
              <div className="text-center">
                <h3 className="font-semibold text-emerald-900">{formData.patientName}</h3>
                <p className="text-sm text-emerald-700 mt-1">
                  {new Date(formData.appointmentDate).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  at {formData.appointmentTime}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Type:</span>
                <span className="font-medium text-slate-900">
                  {APPOINTMENT_TYPES.find((t) => t.id === formData.appointmentType)?.label}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Provider:</span>
                <span className="font-medium text-slate-900">{formData.provider}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Status:</span>
                <span className="font-medium text-slate-900">
                  {STATUSES.find((s) => s.id === formData.status)?.label}
                </span>
              </div>
            </div>

            <Button onClick={handleReset} className="w-full">
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleReset}>
      <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {appointment ? "Edit Appointment" : "Schedule Appointment"}
          </DialogTitle>
          <DialogDescription>
            {appointment ? "Update" : "Create"} appointment details. Fields marked with * are required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          {/* Patient Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <div className="w-1 h-4 bg-blue-500 rounded-full" />
              Patient Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="patientName" className="text-sm font-medium text-slate-700">
                  Patient Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="patientName"
                  type="text"
                  value={formData.patientName}
                  onChange={(e) => handleFieldChange("patientName", e.target.value)}
                  placeholder="e.g., Emma Wilson"
                  className={`text-sm ${
                    errors.patientName
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                      : ""
                  }`}
                />
                {errors.patientName && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.patientName}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="patientPhone" className="text-sm font-medium text-slate-700">
                  Patient Phone <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="patientPhone"
                  type="tel"
                  value={formData.patientPhone}
                  onChange={(e) => handleFieldChange("patientPhone", e.target.value)}
                  placeholder="(555) 123-4567"
                  className={`text-sm ${
                    errors.patientPhone
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                      : ""
                  }`}
                />
                {errors.patientPhone && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.patientPhone}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Appointment Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <div className="w-1 h-4 bg-blue-500 rounded-full" />
              Appointment Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="appointmentDate" className="text-sm font-medium text-slate-700">
                  Appointment Date <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="appointmentDate"
                  type="date"
                  value={formData.appointmentDate}
                  onChange={(e) => handleFieldChange("appointmentDate", e.target.value)}
                  className={`text-sm ${
                    errors.appointmentDate
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                      : ""
                  }`}
                />
                {errors.appointmentDate && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.appointmentDate}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="appointmentTime" className="text-sm font-medium text-slate-700">
                  Appointment Time <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="appointmentTime"
                  type="time"
                  value={formData.appointmentTime}
                  onChange={(e) => handleFieldChange("appointmentTime", e.target.value)}
                  className={`text-sm ${
                    errors.appointmentTime
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                      : ""
                  }`}
                />
                {errors.appointmentTime && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.appointmentTime}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="appointmentType" className="text-sm font-medium text-slate-700">
                  Appointment Type <span className="text-red-500">*</span>
                </Label>
                <select
                  id="appointmentType"
                  value={formData.appointmentType}
                  onChange={(e) => handleFieldChange("appointmentType", e.target.value)}
                  className="w-full h-9 px-3 border border-slate-200 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                >
                  {APPOINTMENT_TYPES.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="provider" className="text-sm font-medium text-slate-700">
                  Provider <span className="text-red-500">*</span>
                </Label>
                <select
                  id="provider"
                  value={formData.provider}
                  onChange={(e) => handleFieldChange("provider", e.target.value)}
                  className="w-full h-9 px-3 border border-slate-200 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                >
                  {PROVIDERS.map((provider) => (
                    <option key={provider.id} value={provider.label}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Additional Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <div className="w-1 h-4 bg-blue-500 rounded-full" />
              Additional Information
            </h3>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="reason" className="text-sm font-medium text-slate-700">
                Reason for Visit <span className="text-red-500">*</span>
              </Label>
              <textarea
                id="reason"
                value={formData.reason}
                onChange={(e) => handleFieldChange("reason", e.target.value)}
                placeholder="e.g., Annual checkup, Vaccination, Fever"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white placeholder-slate-400 ${
                  errors.reason
                    ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                    : "border-slate-200"
                }`}
                rows={2}
              />
              {errors.reason && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.reason}
                </p>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes" className="text-sm font-medium text-slate-700">
                Additional Notes
              </Label>
              <textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleFieldChange("notes", e.target.value)}
                placeholder="Any additional notes or instructions..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white placeholder-slate-400"
                rows={2}
              />
            </div>

            {appointment && (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="status" className="text-sm font-medium text-slate-700">
                  Appointment Status
                </Label>
                <select
                  id="status"
                  value={formData.status}
                  onChange={(e) =>
                    handleFieldChange("status", e.target.value)
                  }
                  className="w-full h-9 px-3 border border-slate-200 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                >
                  {STATUSES.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {Object.keys(errors).length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-red-800">
                <p className="font-medium">
                  Please fix {Object.keys(errors).length} error(s) before submitting
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-4 border-t border-slate-200">
            <Button variant="outline" onClick={handleReset} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || Object.keys(errors).length > 0}
              className="gap-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin">
                    <Calendar className="h-4 w-4" />
                  </div>
                  {appointment ? "Updating..." : "Scheduling..."}
                </>
              ) : (
                <>
                  {appointment ? "Update Appointment" : "Schedule Appointment"}
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
