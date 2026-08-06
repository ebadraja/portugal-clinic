"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Download, ArrowLeft, Loader2, ExternalLink, FileText } from "lucide-react";
import { useRouter, useParams } from "next/navigation";

interface FieldValue {
  id: string;
  fieldLabel?: string;
  fieldType: string;
  value?: string;
}

interface PatientInfo {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
}

interface IntakeFormDetail {
  id: string;
  hippatizFormTitle: string;
  hippatizerId: string;
  hippatizViewLink?: string;
  hippatizPdfLink?: string;
  status: string;
  matchConfidence?: number;
  matchNotes?: string;
  submittedAt: string;
  linkedAt?: string;
  linkedPatientName?: string;
  linkedPatientId?: string;
  fieldValues: FieldValue[];
  patient?: PatientInfo;
  processedAt?: string;
  processedBy?: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

export default function IntakeFormDetailPage() {
  const router = useRouter();
  const params = useParams();
  const formId = params.id as string;

  const [form, setForm] = useState<IntakeFormDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const fetchForm = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/intake-forms/${formId}`);

        if (!response.ok) {
          if (response.status === 404) {
            setErrorMessage("Intake form not found");
          } else {
            setErrorMessage("Failed to load intake form");
          }
          return;
        }

        const data = await response.json();
        setForm(data);
      } catch (error) {
        console.error("Error fetching form:", error);
        setErrorMessage("Failed to load intake form");
      } finally {
        setLoading(false);
      }
    };

    if (formId) {
      fetchForm();
    }
  }, [formId]);

  const handleExportPDF = async () => {
    try {
      setExporting(true);
      const response = await fetch(`/api/intake-forms/${formId}/export/pdf`);

      if (!response.ok) {
        throw new Error("Failed to export PDF");
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form?.hippatizFormTitle.replace(/ /g, "_")}_${formId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error exporting PDF:", error);
      setErrorMessage("Failed to export form as PDF");
    } finally {
      setExporting(false);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "RECEIVED":
        return "bg-blue-100 text-blue-800";
      case "MATCHED":
        return "bg-green-100 text-green-800";
      case "DRAFT":
        return "bg-yellow-100 text-yellow-800";
      case "LINKED":
        return "bg-purple-100 text-purple-800";
      case "ARCHIVED":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <p>Loading intake form...</p>
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-800">{errorMessage}</p>
        </div>
        <Button onClick={() => router.back()} variant="outline" className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-3xl font-bold">{form.hippatizFormTitle}</h1>
          </div>
          <p className="text-sm text-gray-600 ml-14">
            ID: {form.id.slice(0, 12)}... | Submitted{" "}
            {new Date(form.submittedAt).toLocaleDateString()}
          </p>
        </div>
        <div />
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-gray-500 mb-1">Status</p>
          <Badge className={getStatusBadgeColor(form.status)}>{form.status}</Badge>
        </Card>
        {form.matchConfidence !== undefined && (
          <Card className="p-4">
            <p className="text-xs text-gray-500 mb-1">Match Confidence</p>
            <p className="text-lg font-semibold">
              {(form.matchConfidence * 100).toFixed(0)}%
            </p>
          </Card>
        )}
        <Card className="p-4">
          <p className="text-xs text-gray-500 mb-1">Submitted</p>
          <p className="text-sm font-medium">
            {new Date(form.submittedAt).toLocaleDateString()}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 mb-1">Fields</p>
          <p className="text-lg font-semibold">{form.fieldValues.length}</p>
        </Card>
      </div>

      {/* Linked Patient Info */}
      {form.patient && (
        <Card className="p-4 bg-green-50 border border-green-200">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-green-900">Linked to Patient</p>
              <p className="text-green-700 text-sm mt-1">
                {form.patient.firstName} {form.patient.lastName}
              </p>
              {form.patient.email && (
                <p className="text-green-600 text-sm">{form.patient.email}</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Match Notes */}
      {form.matchNotes && (
        <Card className="p-4 bg-blue-50 border border-blue-200">
          <p className="text-sm font-medium text-blue-900 mb-2">Match Notes</p>
          <p className="text-blue-800 text-sm">{form.matchNotes}</p>
        </Card>
      )}

      {/* Form Fields */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Form Data</h2>
        <div className="space-y-4">
          {form.fieldValues.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No field values found</p>
          ) : (
            form.fieldValues.map((field) => (
              <div key={field.id} className="border-b last:border-0 pb-4 last:pb-0">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                  {field.fieldLabel || field.fieldType}
                </p>
                <p className="text-gray-900 font-medium break-words">
                  {field.value || "(empty)"}
                </p>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Processing Info */}
      {form.processedBy && form.processedAt && (
        <Card className="p-4 bg-gray-50 border border-gray-200">
          <p className="text-xs text-gray-600 mb-2">Last Processed By</p>
          <p className="text-sm font-medium">
            {form.processedBy.firstName} {form.processedBy.lastName}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {new Date(form.processedAt).toLocaleString()}
          </p>
        </Card>
      )}
    </div>
  );
}
