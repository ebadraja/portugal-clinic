"use client";

import { useState, useRef } from "react";
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
  Upload,
  FileUp,
  X,
} from "lucide-react";

interface UploadDocumentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientName?: string;
  onDocumentsUploaded?: (documents: DocumentData[]) => void;
}

interface DocumentData {
  id?: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  documentType: "medical_record" | "vaccination" | "prescription" | "insurance" | "consent" | "other";
  patientName: string;
  notes: string;
  uploadedAt?: string;
}

interface FormErrors {
  [key: string]: string;
}

interface UploadedFile {
  file: File;
  documentType: string;
  notes: string;
  id: string;
}

const DOCUMENT_TYPES = [
  { id: "medical_record", label: "Medical Record", color: "bg-blue-50" },
  { id: "vaccination", label: "Vaccination Card", color: "bg-green-50" },
  { id: "prescription", label: "Prescription", color: "bg-purple-50" },
  { id: "insurance", label: "Insurance Card", color: "bg-orange-50" },
  { id: "consent", label: "Consent Form", color: "bg-pink-50" },
  { id: "other", label: "Other", color: "bg-slate-50" },
];

const ALLOWED_TYPES = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".gif"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function UploadDocumentsModal({
  open,
  onOpenChange,
  patientName = "",
  onDocumentsUploaded,
}: UploadDocumentsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    const newFiles: UploadedFile[] = [];
    const newErrors: FormErrors = {};

    Array.from(selectedFiles).forEach((file, index) => {
      const fileExt = "." + file.name.split(".").pop()?.toLowerCase();

      // Validate file type
      if (!ALLOWED_TYPES.includes(fileExt)) {
        newErrors[`file-${index}`] = `File type not allowed. Allowed types: ${ALLOWED_TYPES.join(", ")}`;
        return;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        newErrors[`file-${index}`] = `File size exceeds 10MB limit (${(file.size / 1024 / 1024).toFixed(2)}MB)`;
        return;
      }

      newFiles.push({
        id: Math.random().toString(36).substr(2, 9),
        file,
        documentType: "other",
        notes: "",
      });
    });

    setErrors(newErrors);
    setFiles((prev) => [...prev, ...newFiles]);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    const newErrors = { ...errors };
    delete newErrors[`file-${fileId}`];
    setErrors(newErrors);
  };

  const handleFileUpdate = (
    fileId: string,
    field: "documentType" | "notes",
    value: string
  ) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, [field]: value } : f))
    );
  };

  const validateFiles = (): boolean => {
    if (files.length === 0) {
      setErrors({ general: "Please select at least one file to upload" });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateFiles()) {
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    // Simulate upload progress
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          return prev;
        }
        return prev + Math.random() * 30;
      });
    }, 300);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    clearInterval(interval);
    setUploadProgress(100);

    await new Promise((resolve) => setTimeout(resolve, 500));

    setUploading(false);
    setSubmitted(true);

    if (onDocumentsUploaded) {
      const documents: DocumentData[] = files.map((f) => ({
        fileName: f.file.name,
        fileType: "." + f.file.name.split(".").pop()?.toLowerCase(),
        fileSize: f.file.size,
        documentType: f.documentType as any,
        patientName,
        notes: f.notes,
        uploadedAt: new Date().toISOString(),
      }));
      onDocumentsUploaded(documents);
    }

    setTimeout(() => {
      handleReset();
    }, 2000);
  };

  const handleReset = () => {
    setFiles([]);
    setErrors({});
    setUploading(false);
    setUploadProgress(0);
    setSubmitted(false);
    onOpenChange(false);
  };

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={handleReset}>
        <DialogContent className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle>Documents Uploaded</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 flex flex-col items-center gap-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-600" />
              <div className="text-center">
                <h3 className="font-semibold text-emerald-900">
                  {files.length} Document{files.length !== 1 ? "s" : ""} Uploaded
                </h3>
                <p className="text-sm text-emerald-700 mt-1">
                  successfully saved for {patientName}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-xs max-h-40 overflow-y-auto">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-2 bg-white rounded border border-slate-200"
                >
                  <span className="font-medium text-slate-900 truncate">
                    {file.file.name}
                  </span>
                  <span className="text-slate-500">
                    {(file.file.size / 1024 / 1024).toFixed(2)}MB
                  </span>
                </div>
              ))}
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
            <FileUp className="h-5 w-5" />
            Upload Documents
          </DialogTitle>
          <DialogDescription>
            Upload medical records, insurance cards, prescriptions, and other documents for {patientName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          {/* File Upload Area */}
          {!uploading && (
            <div
              className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <p className="font-medium text-slate-900 mb-1">
                Click to upload or drag and drop
              </p>
              <p className="text-sm text-slate-500">
                Supported formats: PDF, DOC, DOCX, JPG, PNG, GIF (max 10MB each)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
              />
            </div>
          )}

          {/* Upload Progress */}
          {uploading && (
            <div className="space-y-4 py-8">
              <div className="text-center">
                <Upload className="h-8 w-8 text-blue-500 mx-auto mb-3 animate-bounce" />
                <p className="font-medium text-slate-900 mb-4">
                  Uploading {files.length} document{files.length !== 1 ? "s" : ""}...
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Progress</span>
                  <span className="text-sm text-slate-500">{Math.round(uploadProgress)}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Files List */}
          {!uploading && files.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Selected Files ({files.length})
              </h3>

              <div className="space-y-3 max-h-60 overflow-y-auto">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="border border-slate-200 rounded-lg p-4 bg-slate-50"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 truncate">
                          {file.file.name}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {(file.file.size / 1024).toFixed(1)}KB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(file.id)}
                        className="ml-3 p-1 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X className="h-4 w-4 text-red-600" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label
                          htmlFor={`type-${file.id}`}
                          className="text-xs font-medium text-slate-700"
                        >
                          Document Type
                        </Label>
                        <select
                          id={`type-${file.id}`}
                          value={file.documentType}
                          onChange={(e) =>
                            handleFileUpdate(file.id, "documentType", e.target.value)
                          }
                          className="w-full h-8 px-2 border border-slate-200 rounded text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        >
                          {DOCUMENT_TYPES.map((type) => (
                            <option key={type.id} value={type.id}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <Label
                          htmlFor={`notes-${file.id}`}
                          className="text-xs font-medium text-slate-700"
                        >
                          Notes (optional)
                        </Label>
                        <Input
                          id={`notes-${file.id}`}
                          type="text"
                          value={file.notes}
                          onChange={(e) =>
                            handleFileUpdate(file.id, "notes", e.target.value)
                          }
                          placeholder="e.g., Page 1 of 3"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Messages */}
          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-red-800">
                <p className="font-medium">{errors.general}</p>
              </div>
            </div>
          )}

          {Object.entries(errors)
            .filter(([key]) => key.startsWith("file-"))
            .map(([_, error]) => (
              <div
                key={_}
                className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-2"
              >
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-800">{error}</div>
              </div>
            ))}

          {/* Submit Buttons */}
          <div className="flex gap-2 justify-end pt-4 border-t border-slate-200">
            <Button variant="outline" onClick={handleReset} disabled={uploading}>
              Cancel
            </Button>
            {!uploading && files.length > 0 ? (
              <Button type="submit" className="gap-2">
                Upload {files.length} Document{files.length !== 1 ? "s" : ""}
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
