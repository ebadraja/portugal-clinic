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
  Edit,
} from "lucide-react";

interface EditPatientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient?: PatientData;
  onPatientUpdated?: (patient: PatientData) => void;
}

interface PatientData {
  id?: string;
  name: string;
  dob: string;
  parent: string;
  parentPhone: string;
  parentEmail: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  insurance: string;
  policyNumber: string;
  allergies: string;
  medicalHistory: string;
  emergencyContact: string;
  emergencyPhone: string;
}

interface FormErrors {
  [key: string]: string;
}

const INITIAL_PATIENT: PatientData = {
  name: "",
  dob: "",
  parent: "",
  parentPhone: "",
  parentEmail: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  insurance: "",
  policyNumber: "",
  allergies: "",
  medicalHistory: "",
  emergencyContact: "",
  emergencyPhone: "",
};

const FORM_SECTIONS = [
  {
    title: "Patient Information",
    fields: ["name", "dob"],
  },
  {
    title: "Parent/Guardian Information",
    fields: ["parent", "parentPhone", "parentEmail"],
  },
  {
    title: "Address",
    fields: ["address", "city", "state", "zipCode"],
  },
  {
    title: "Insurance Information",
    fields: ["insurance", "policyNumber"],
  },
  {
    title: "Medical Information",
    fields: ["allergies", "medicalHistory"],
  },
  {
    title: "Emergency Contact",
    fields: ["emergencyContact", "emergencyPhone"],
  },
];

const FIELD_CONFIG: Record<string, any> = {
  name: {
    label: "Patient Name",
    type: "text",
    required: true,
    placeholder: "e.g., Emma Wilson",
  },
  dob: {
    label: "Date of Birth",
    type: "date",
    required: true,
    placeholder: "YYYY-MM-DD",
  },
  parent: {
    label: "Parent/Guardian Name",
    type: "text",
    required: true,
    placeholder: "e.g., Sarah Wilson",
  },
  parentPhone: {
    label: "Parent Phone",
    type: "tel",
    required: true,
    placeholder: "(555) 123-4567",
  },
  parentEmail: {
    label: "Parent Email",
    type: "email",
    required: false,
    placeholder: "parent@example.com",
  },
  address: {
    label: "Street Address",
    type: "text",
    required: false,
    placeholder: "123 Main St",
  },
  city: {
    label: "City",
    type: "text",
    required: false,
    placeholder: "New York",
  },
  state: {
    label: "State",
    type: "text",
    required: false,
    placeholder: "NY",
    maxLength: 2,
  },
  zipCode: {
    label: "ZIP Code",
    type: "text",
    required: false,
    placeholder: "10001",
  },
  insurance: {
    label: "Insurance Provider",
    type: "text",
    required: false,
    placeholder: "e.g., Aetna, United Health",
  },
  policyNumber: {
    label: "Policy Number",
    type: "text",
    required: false,
    placeholder: "e.g., POL123456",
  },
  allergies: {
    label: "Known Allergies",
    type: "textarea",
    required: false,
    placeholder: "e.g., Penicillin, Peanuts (enter 'None' if no allergies)",
  },
  medicalHistory: {
    label: "Medical History Notes",
    type: "textarea",
    required: false,
    placeholder: "e.g., Asthma, Previous surgeries, Chronic conditions",
  },
  emergencyContact: {
    label: "Emergency Contact Name",
    type: "text",
    required: false,
    placeholder: "e.g., John Wilson",
  },
  emergencyPhone: {
    label: "Emergency Contact Phone",
    type: "tel",
    required: false,
    placeholder: "(555) 987-6543",
  },
};

export default function EditPatientModal({
  open,
  onOpenChange,
  patient,
  onPatientUpdated,
}: EditPatientModalProps) {
  const [formData, setFormData] = useState<PatientData>(INITIAL_PATIENT);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (patient && open) {
      setFormData(patient);
    }
  }, [patient, open]);

  const validateField = (fieldName: string, value: string): string | null => {
    const now = new Date();

    switch (fieldName) {
      case "name":
        if (!value.trim()) return "Patient name is required";
        if (value.length > 100) return "Patient name must be 100 characters or less";
        return null;

      case "dob":
        if (!value) return "Date of birth is required";
        const dobDate = new Date(value);
        if (isNaN(dobDate.getTime())) return "Invalid date format (use YYYY-MM-DD)";
        if (dobDate > now) return "Date of birth cannot be in the future";
        const age = now.getFullYear() - dobDate.getFullYear();
        if (age > 18) return "Patient age exceeds 18 years (pediatric limit)";
        return null;

      case "parent":
        if (!value.trim()) return "Parent/Guardian name is required";
        if (value.length > 100) return "Parent name must be 100 characters or less";
        return null;

      case "parentPhone":
        if (!value) return "Parent phone is required";
        const phoneRegex = /^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/;
        if (!phoneRegex.test(value.replace(/\s/g, "")))
          return "Phone must be in format: (555) 123-4567";
        return null;

      case "parentEmail":
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
          return "Invalid email format";
        return null;

      case "state":
        if (value && value.length > 2) return "State code must be 2 characters";
        return null;

      case "zipCode":
        if (value && !/^\d{5}(-\d{4})?$/.test(value.replace(/\s/g, "")))
          return "ZIP code must be 5 digits (or 9 with extension)";
        return null;

      case "emergencyPhone":
        if (value) {
          const phoneRegex = /^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/;
          if (!phoneRegex.test(value.replace(/\s/g, "")))
            return "Phone must be in format: (555) 123-4567";
        }
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

    Object.entries(FIELD_CONFIG).forEach(([fieldName, config]) => {
      if (config.required) {
        const value = formData[fieldName as keyof PatientData] || "";
        const error = validateField(fieldName, value);
        if (error) {
          newErrors[fieldName] = error;
        }
      }
    });

    Object.entries(FIELD_CONFIG).forEach(([fieldName, config]) => {
      if (!config.required) {
        const value = formData[fieldName as keyof PatientData];
        if (value) {
          const error = validateField(fieldName, value);
          if (error) {
            newErrors[fieldName] = error;
          }
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    setIsLoading(false);
    setSubmitted(true);

    if (onPatientUpdated) {
      onPatientUpdated(formData);
    }

    setTimeout(() => {
      handleReset();
    }, 2000);
  };

  const handleReset = () => {
    setFormData(INITIAL_PATIENT);
    setErrors({});
    setSubmitted(false);
    onOpenChange(false);
  };

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={handleReset}>
        <DialogContent className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle>Changes Saved</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 flex flex-col items-center gap-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-600" />
              <div className="text-center">
                <h3 className="font-semibold text-emerald-900">{formData.name}</h3>
                <p className="text-sm text-emerald-700 mt-1">
                  patient information updated successfully
                </p>
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
            <Edit className="h-5 w-5" />
            Edit Patient
          </DialogTitle>
          <DialogDescription>
            Update patient information. Fields marked with * are required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          {FORM_SECTIONS.map((section) => (
            <div key={section.title} className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <div className="w-1 h-4 bg-blue-500 rounded-full" />
                {section.title}
              </h3>

              <div
                className={`grid grid-cols-1 ${
                  section.fields.length === 1 ? "" : "md:grid-cols-2"
                } gap-4`}
              >
                {section.fields.map((fieldName) => {
                  const config = FIELD_CONFIG[fieldName];
                  const value = formData[fieldName as keyof PatientData];
                  const error = errors[fieldName];

                  if (config.type === "textarea") {
                    return (
                      <div key={fieldName} className="md:col-span-2 space-y-2">
                        <Label
                          htmlFor={fieldName}
                          className="text-sm font-medium text-slate-700"
                        >
                          {config.label}
                          {config.required && (
                            <span className="text-red-500 ml-1">*</span>
                          )}
                        </Label>
                        <textarea
                          id={fieldName}
                          value={value}
                          onChange={(e) =>
                            handleFieldChange(fieldName, e.target.value)
                          }
                          placeholder={config.placeholder}
                          className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white placeholder-slate-400 ${
                            error
                              ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                              : "border-slate-200"
                          }`}
                          rows={3}
                        />
                        {error && (
                          <p className="text-xs text-red-600 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {error}
                          </p>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={fieldName} className="space-y-2">
                      <Label
                        htmlFor={fieldName}
                        className="text-sm font-medium text-slate-700"
                      >
                        {config.label}
                        {config.required && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </Label>
                      <Input
                        id={fieldName}
                        type={config.type}
                        value={value}
                        onChange={(e) =>
                          handleFieldChange(fieldName, e.target.value)
                        }
                        placeholder={config.placeholder}
                        maxLength={config.maxLength}
                        className={`text-sm ${
                          error
                            ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                            : ""
                        }`}
                      />
                      {error && (
                        <p className="text-xs text-red-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {error}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {Object.keys(errors).length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-red-800">
                <p className="font-medium">Please fix {Object.keys(errors).length} error(s) before submitting</p>
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
                    <Edit className="h-4 w-4" />
                  </div>
                  Saving Changes...
                </>
              ) : (
                <>
                  Save Changes
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
