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
  FileText,
} from "lucide-react";

interface AddNotesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientName?: string;
  onNoteSaved?: (note: NoteData) => void;
}

interface NoteData {
  id?: string;
  patientName: string;
  noteType: "clinical" | "administrative" | "follow-up" | "observation";
  title: string;
  content: string;
  createdAt?: string;
  createdBy?: string;
}

interface FormErrors {
  [key: string]: string;
}

const INITIAL_NOTE: NoteData = {
  patientName: "",
  noteType: "clinical",
  title: "",
  content: "",
};

const NOTE_TYPES = [
  { id: "clinical", label: "Clinical Note", color: "bg-blue-50 text-blue-900 border-blue-200" },
  { id: "administrative", label: "Administrative Note", color: "bg-slate-50 text-slate-900 border-slate-200" },
  { id: "follow-up", label: "Follow-up Note", color: "bg-amber-50 text-amber-900 border-amber-200" },
  { id: "observation", label: "Observation Note", color: "bg-green-50 text-green-900 border-green-200" },
];

export default function AddNotesModal({
  open,
  onOpenChange,
  patientName = "",
  onNoteSaved,
}: AddNotesModalProps) {
  const [formData, setFormData] = useState<NoteData>({
    ...INITIAL_NOTE,
    patientName,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [charCount, setCharCount] = useState(0);

  const validateField = (fieldName: string, value: string): string | null => {
    switch (fieldName) {
      case "title":
        if (!value.trim()) return "Note title is required";
        if (value.length > 100) return "Title must be 100 characters or less";
        return null;

      case "content":
        if (!value.trim()) return "Note content is required";
        if (value.length > 5000) return "Note content must be 5000 characters or less";
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

    if (fieldName === "content") {
      setCharCount(value.length);
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

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    const titleError = validateField("title", formData.title);
    if (titleError) {
      newErrors.title = titleError;
    }

    const contentError = validateField("content", formData.content);
    if (contentError) {
      newErrors.content = contentError;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    await new Promise((resolve) => setTimeout(resolve, 1200));

    setIsLoading(false);
    setSubmitted(true);

    if (onNoteSaved) {
      onNoteSaved({
        ...formData,
        createdAt: new Date().toISOString(),
        createdBy: "Dr. Tamas",
      });
    }

    setTimeout(() => {
      handleReset();
    }, 2000);
  };

  const handleReset = () => {
    setFormData({
      ...INITIAL_NOTE,
      patientName,
    });
    setErrors({});
    setSubmitted(false);
    setCharCount(0);
    onOpenChange(false);
  };

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={handleReset}>
        <DialogContent className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle>Note Saved</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 flex flex-col items-center gap-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-600" />
              <div className="text-center">
                <h3 className="font-semibold text-emerald-900">{formData.title}</h3>
                <p className="text-sm text-emerald-700 mt-1">
                  {NOTE_TYPES.find((t) => t.id === formData.noteType)?.label}
                </p>
                <p className="text-xs text-emerald-600 mt-2">
                  saved for {formData.patientName}
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
            <FileText className="h-5 w-5" />
            Add Note
          </DialogTitle>
          <DialogDescription>
            Add a new note for {patientName}. Fields marked with * are required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          {/* Note Type Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-slate-700">Note Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {NOTE_TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => handleFieldChange("noteType", type.id)}
                  className={`p-3 rounded-lg border-2 transition-all font-medium text-sm ${
                    formData.noteType === type.id
                      ? `${type.color} border-current`
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Note Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-medium text-slate-700">
              Note Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="title"
              type="text"
              value={formData.title}
              onChange={(e) => handleFieldChange("title", e.target.value)}
              placeholder="e.g., Post-vaccination follow-up, Allergy consultation"
              className={`text-sm ${
                errors.title
                  ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                  : ""
              }`}
              maxLength={100}
            />
            <div className="flex justify-between items-center">
              {errors.title && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.title}
                </p>
              )}
              <span className="text-xs text-slate-500 ml-auto">
                {formData.title.length}/100
              </span>
            </div>
          </div>

          {/* Note Content */}
          <div className="space-y-2">
            <Label htmlFor="content" className="text-sm font-medium text-slate-700">
              Note Content <span className="text-red-500">*</span>
            </Label>
            <textarea
              id="content"
              value={formData.content}
              onChange={(e) => handleFieldChange("content", e.target.value)}
              placeholder="Enter detailed clinical observations, findings, recommendations, or administrative notes..."
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white placeholder-slate-400 ${
                errors.content
                  ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                  : "border-slate-200"
              }`}
              rows={6}
              maxLength={5000}
            />
            <div className="flex justify-between items-center">
              {errors.content && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.content}
                </p>
              )}
              <span className="text-xs text-slate-500 ml-auto">
                {charCount}/5000
              </span>
            </div>
          </div>

          {/* Note Info */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Patient:</span>
              <span className="font-medium text-slate-900">{formData.patientName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Type:</span>
              <span className="font-medium text-slate-900">
                {NOTE_TYPES.find((t) => t.id === formData.noteType)?.label}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Created By:</span>
              <span className="font-medium text-slate-900">Dr. Tamas</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Timestamp:</span>
              <span className="font-medium text-slate-900">
                {new Date().toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
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
                    <FileText className="h-4 w-4" />
                  </div>
                  Saving Note...
                </>
              ) : (
                <>
                  Save Note
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
