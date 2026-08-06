"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, User, Phone, Mail, MapPin, Calendar, Heart,
  FileText, CheckCircle, Loader2, AlertCircle, UserCheck,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { format } from "date-fns";

interface DraftDetail {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  preferredPronouns: string | null;
  preferredLanguage: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  caregiver1FirstName: string | null;
  caregiver1LastName: string | null;
  caregiver1Relationship: string | null;
  caregiver1Phone: string | null;
  caregiver1Email: string | null;
  caregiver2FirstName: string | null;
  caregiver2LastName: string | null;
  caregiver2Relationship: string | null;
  caregiver2Phone: string | null;
  caregiver2Email: string | null;
  pcpName: string | null;
  pcpClinicName: string | null;
  pcpPhone: string | null;
  status: string;
  createdAt: string;
  intakeForms: Array<{
    id: string;
    hippatizFormTitle: string;
    submittedAt: string;
  }>;
  createdBy: { firstName: string; lastName: string; email: string } | null;
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 sm:w-44 shrink-0">{label}</span>
      <span className="text-sm text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}

function calculateAge(dob: string): string {
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return `${age} years old`;
}

export default function PatientDraftDetailPage() {
  const router = useRouter();
  const params = useParams();
  const draftId = params.id as string;

  const [draft, setDraft] = useState<DraftDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch(`/api/patient-drafts/${draftId}/publish`);
        if (!res.ok) throw new Error("Not found");
        const data = await res.json();
        setDraft(data);
      } catch {
        setError("Could not load draft patient.");
      } finally {
        setLoading(false);
      }
    };
    fetch_();
  }, [draftId]);

  const handleConvert = async () => {
    setConverting(true);
    try {
      const res = await fetch(`/api/patient-drafts/${draftId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Conversion failed");
      // Redirect to the new real patient profile
      router.push(`/patients/${data.patient.id}`);
    } catch (e: any) {
      setError(e.message);
      setConverting(false);
    }
    setShowConvertDialog(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !draft) {
    return (
      <div className="pt-8 text-center">
        <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
        <p className="text-slate-600 dark:text-slate-400">{error || "Draft not found"}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  const fullName = `${draft.firstName} ${draft.lastName}`;
  const initials = `${draft.firstName[0] ?? ""}${draft.lastName[0] ?? ""}`.toUpperCase();

  return (
    <div className="pt-4 pb-8 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1 text-slate-600 dark:text-slate-400">
          <ArrowLeft className="h-4 w-4" />Back
        </Button>
      </div>

      {/* Profile hero */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 flex items-center justify-center text-xl font-semibold shrink-0">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">{fullName}</h1>
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-0">
                  Draft
                </Badge>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                {calculateAge(draft.dateOfBirth)} &bull; DOB: {format(new Date(draft.dateOfBirth), "MMMM d, yyyy")}
              </p>
              {draft.phone && (
                <p className="text-slate-500 dark:text-slate-400 text-sm flex items-center gap-1 mt-1">
                  <Phone className="h-3 w-3" />{draft.phone}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {draft.intakeForms[0] && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => router.push(`/intake-forms/${draft.intakeForms[0].id}`)}>
                <FileText className="h-4 w-4" />View Intake Form
              </Button>
            )}
            <Button
              size="sm"
              className="gap-2 bg-green-600 hover:bg-green-700"
              onClick={() => setShowConvertDialog(true)}
              disabled={draft.status === "PUBLISHED"}
            >
              <UserCheck className="h-4 w-4" />
              {draft.status === "PUBLISHED" ? "Already Converted" : "Convert to Patient"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Patient Info */}
        <Card className="dark:bg-slate-900 dark:border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 dark:text-slate-100">
              <User className="h-4 w-4 text-blue-500" />Patient Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <InfoRow label="Full Name" value={fullName} />
            <InfoRow label="Date of Birth" value={format(new Date(draft.dateOfBirth), "MMMM d, yyyy")} />
            <InfoRow label="Gender" value={draft.gender} />
            <InfoRow label="Preferred Pronouns" value={draft.preferredPronouns} />
            <InfoRow label="Preferred Language" value={draft.preferredLanguage} />
          </CardContent>
        </Card>

        {/* Contact Info */}
        <Card className="dark:bg-slate-900 dark:border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 dark:text-slate-100">
              <Phone className="h-4 w-4 text-green-500" />Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <InfoRow label="Phone" value={draft.phone} />
            <InfoRow label="Email" value={draft.email} />
            <InfoRow label="Street Address" value={draft.streetAddress} />
            <InfoRow label="City" value={draft.city} />
            <InfoRow label="State" value={draft.state} />
            <InfoRow label="Zip Code" value={draft.zipCode} />
          </CardContent>
        </Card>

        {/* Caregiver 1 */}
        {(draft.caregiver1FirstName || draft.caregiver1Phone) && (
          <Card className="dark:bg-slate-900 dark:border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 dark:text-slate-100">
                <Heart className="h-4 w-4 text-pink-500" />Parent / Caregiver 1
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <InfoRow label="Name" value={[draft.caregiver1FirstName, draft.caregiver1LastName].filter(Boolean).join(" ")} />
              <InfoRow label="Relationship" value={draft.caregiver1Relationship} />
              <InfoRow label="Phone" value={draft.caregiver1Phone} />
              <InfoRow label="Email" value={draft.caregiver1Email} />
            </CardContent>
          </Card>
        )}

        {/* Caregiver 2 */}
        {(draft.caregiver2FirstName || draft.caregiver2Phone) && (
          <Card className="dark:bg-slate-900 dark:border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 dark:text-slate-100">
                <Heart className="h-4 w-4 text-pink-400" />Parent / Caregiver 2
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <InfoRow label="Name" value={[draft.caregiver2FirstName, draft.caregiver2LastName].filter(Boolean).join(" ")} />
              <InfoRow label="Relationship" value={draft.caregiver2Relationship} />
              <InfoRow label="Phone" value={draft.caregiver2Phone} />
              <InfoRow label="Email" value={draft.caregiver2Email} />
            </CardContent>
          </Card>
        )}

        {/* Primary Care Provider */}
        {(draft.pcpName || draft.pcpClinicName) && (
          <Card className="dark:bg-slate-900 dark:border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 dark:text-slate-100">
                <Calendar className="h-4 w-4 text-teal-500" />Previous Pediatrician / PCP
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <InfoRow label="Doctor Name" value={draft.pcpName} />
              <InfoRow label="Clinic" value={draft.pcpClinicName} />
              <InfoRow label="Phone" value={draft.pcpPhone} />
            </CardContent>
          </Card>
        )}

        {/* Intake Forms */}
        <Card className="dark:bg-slate-900 dark:border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 dark:text-slate-100">
              <FileText className="h-4 w-4 text-slate-500" />Submitted Forms
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {draft.intakeForms.length === 0 ? (
              <p className="text-sm text-slate-400">No forms linked</p>
            ) : (
              draft.intakeForms.map((f) => (
                <div key={f.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{f.hippatizFormTitle}</p>
                    <p className="text-xs text-slate-500">{format(new Date(f.submittedAt), "MMM d, yyyy")}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => router.push(`/intake-forms/${f.id}`)}>
                    <FileText className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Convert confirmation dialog */}
      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />Convert to Patient
            </DialogTitle>
            <DialogDescription>
              This will create a real patient record for <strong>{fullName}</strong> and move them to the All Patients tab. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1 bg-green-600 hover:bg-green-700 gap-2" onClick={handleConvert} disabled={converting}>
              {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
              {converting ? "Converting..." : "Yes, Convert"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setShowConvertDialog(false)} disabled={converting}>
              Cancel
            </Button>
          </div>
          {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
