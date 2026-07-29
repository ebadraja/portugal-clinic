"use client";

import { useState } from "react";
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
  UserPlus,
  Mail,
} from "lucide-react";

interface InviteStaffModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStaffInvited?: () => void;
}

interface InviteData {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "admin" | "staff" | "viewer";
  department: string;
  permissions: {
    patients: boolean;
    appointments: boolean;
    calls: boolean;
    reports: boolean;
  };
  invitedAt?: string;
  inviteToken?: string;
}

interface FormErrors {
  [key: string]: string;
}

const INITIAL_INVITE: InviteData = {
  firstName: "",
  lastName: "",
  email: "",
  role: "staff",
  department: "",
  permissions: {
    patients: true,
    appointments: true,
    calls: false,
    reports: false,
  },
};

const ROLES = [
  { id: "admin", label: "Administrator", description: "Full access to all features" },
  { id: "staff", label: "Staff", description: "Access to patients, appointments, and calls" },
  { id: "viewer", label: "Viewer", description: "Read-only access" },
];

const DEPARTMENTS = [
  "Pediatrics",
  "Nurse Station",
  "Administration",
  "Reception",
  "Billing",
  "Medical Records",
];

const PERMISSION_SETS: Record<string, InviteData["permissions"]> = {
  admin: { patients: true, appointments: true, calls: true, reports: true },
  staff: { patients: true, appointments: true, calls: true, reports: false },
  viewer: { patients: true, appointments: false, calls: false, reports: false },
};

export default function InviteStaffModal({
  open,
  onOpenChange,
  onStaffInvited,
}: InviteStaffModalProps) {
  const [formData, setFormData] = useState<InviteData>(INITIAL_INVITE);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const validateField = (fieldName: string, value: string): string | null => {
    switch (fieldName) {
      case "firstName":
        if (!value.trim()) return "First name is required";
        if (value.length > 50) return "First name must be 50 characters or less";
        return null;

      case "lastName":
        if (!value.trim()) return "Last name is required";
        if (value.length > 50) return "Last name must be 50 characters or less";
        return null;

      case "email":
        if (!value.trim()) return "Email is required";
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) return "Invalid email format";
        return null;

      case "department":
        if (!value.trim()) return "Department is required";
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

    if (fieldName === "role") {
      // Update permissions based on role
      setFormData((prev) => ({
        ...prev,
        permissions: PERMISSION_SETS[value as keyof typeof PERMISSION_SETS],
      }));
    }

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

  const handlePermissionChange = (permission: keyof InviteData["permissions"]) => {
    setFormData((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [permission]: !prev.permissions[permission],
      },
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    const requiredFields = ["firstName", "lastName", "email", "department"];

    requiredFields.forEach((fieldName) => {
      const value = formData[fieldName as keyof InviteData];
      const error = validateField(fieldName, value as string);
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
    setServerError(null);

    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          role: formData.role,
          jobTitle: formData.department,
          department: formData.department,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setServerError(data.error || 'Failed to send invitation');
        setIsLoading(false);
        return;
      }

      setSubmitted(true);
      if (onStaffInvited) onStaffInvited();

      setTimeout(() => handleReset(), 2500);
    } catch {
      setServerError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setFormData(INITIAL_INVITE);
    setErrors({});
    setSubmitted(false);
    setServerError(null);
    onOpenChange(false);
  };

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={handleReset}>
        <DialogContent className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle>Invitation Sent</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 flex flex-col items-center gap-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-600" />
              <div className="text-center">
                <h3 className="font-semibold text-emerald-900">
                  {formData.firstName} {formData.lastName}
                </h3>
                <p className="text-sm text-emerald-700 mt-1">
                  invitation sent to {formData.email}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Role:</span>
                <span className="font-medium text-slate-900">
                  {ROLES.find((r) => r.id === formData.role)?.label}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Department:</span>
                <span className="font-medium text-slate-900">{formData.department}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Status:</span>
                <span className="font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded">
                  Pending
                </span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800">
                Their account is <strong>pending approval</strong>. An admin must approve it from the Staff Management page before they can log in.
              </p>
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
            <UserPlus className="h-5 w-5" />
            Invite Staff Member
          </DialogTitle>
          <DialogDescription>
            Send an invitation to a new team member. Fields marked with * are required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          {/* Personal Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <div className="w-1 h-4 bg-blue-500 rounded-full" />
              Personal Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-sm font-medium text-slate-700">
                  First Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => handleFieldChange("firstName", e.target.value)}
                  placeholder="e.g., Sarah"
                  className={`text-sm ${
                    errors.firstName
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                      : ""
                  }`}
                  maxLength={50}
                />
                {errors.firstName && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.firstName}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-sm font-medium text-slate-700">
                  Last Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => handleFieldChange("lastName", e.target.value)}
                  placeholder="e.g., Johnson"
                  className={`text-sm ${
                    errors.lastName
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                      : ""
                  }`}
                  maxLength={50}
                />
                {errors.lastName && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.lastName}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                Email Address <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleFieldChange("email", e.target.value)}
                placeholder="sarah.johnson@example.com"
                className={`text-sm ${
                  errors.email ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" : ""
                }`}
              />
              {errors.email && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.email}
                </p>
              )}
            </div>
          </div>

          {/* Position Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <div className="w-1 h-4 bg-blue-500 rounded-full" />
              Position Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role" className="text-sm font-medium text-slate-700">
                  Role
                </Label>
                <select
                  id="role"
                  value={formData.role}
                  onChange={(e) => handleFieldChange("role", e.target.value)}
                  className="w-full h-9 px-3 border border-slate-200 rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                >
                  {ROLES.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">
                  {ROLES.find((r) => r.id === formData.role)?.description}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="department" className="text-sm font-medium text-slate-700">
                  Department <span className="text-red-500">*</span>
                </Label>
                <select
                  id="department"
                  value={formData.department}
                  onChange={(e) => handleFieldChange("department", e.target.value)}
                  className={`w-full h-9 px-3 border rounded-lg text-slate-900 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm ${
                    errors.department ? "border-red-300 focus:border-red-500" : "border-slate-200"
                  }`}
                >
                  <option value="">Select department...</option>
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
                {errors.department && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.department}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Permissions */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <div className="w-1 h-4 bg-blue-500 rounded-full" />
              Permissions
            </h3>

            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.permissions.patients}
                  onChange={() => handlePermissionChange("patients")}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm font-medium text-slate-700">View & Manage Patients</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.permissions.appointments}
                  onChange={() => handlePermissionChange("appointments")}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm font-medium text-slate-700">View & Manage Appointments</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.permissions.calls}
                  onChange={() => handlePermissionChange("calls")}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm font-medium text-slate-700">View Call Logs</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.permissions.reports}
                  onChange={() => handlePermissionChange("reports")}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm font-medium text-slate-700">View Reports & Analytics</span>
              </label>
            </div>
          </div>

          {Object.keys(errors).length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-red-800">
                <p className="font-medium">
                  Please fix {Object.keys(errors).length} error(s) before sending invitation
                </p>
              </div>
            </div>
          )}

          {serverError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-800 font-medium">{serverError}</p>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">Pending Approval Required</p>
              <p>
                The account will be created with <strong>PENDING</strong> status. An admin must approve it before the staff member can log in. Default password: <code className="bg-amber-100 px-1 rounded font-mono">Kid0-18CRM</code>
              </p>
            </div>
          </div>

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
                    <Mail className="h-4 w-4" />
                  </div>
                  Sending Invitation...
                </>
              ) : (
                <>
                  Send Invitation
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
