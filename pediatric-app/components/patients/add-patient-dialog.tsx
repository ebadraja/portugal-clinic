"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronDown, ChevronUp, Loader2, Plus } from "lucide-react";
import { ALL_PLANS, PLAN_TYPES } from "@/lib/insurance-plans";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";

// ── Zod schema ────────────────────────────────────────────────────────────────

const US_PHONE = /^\(\d{3}\) \d{3}-\d{4}$/;
const US_ZIP   = /^\d{5}(-\d{4})?$/;
const US_STATE = /^[A-Z]{2}$/;

const patientSchema = z.object({
  firstName:       z.string().min(1, "First name is required").max(50),
  lastName:        z.string().min(1, "Last name is required").max(50),
  dateOfBirth:     z.string()
    .min(1, "Date of birth is required")
    .refine((v) => {
      const d = new Date(v);
      if (isNaN(d.getTime())) return false;
      const now = new Date();
      const eighteenYearsAgo = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());
      return d <= now && d >= eighteenYearsAgo;
    }, "Patient must be between 0 and 18 years old and date must be in the past"),
  gender:          z.enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]).optional(),
  phone:           z.string().min(1, "Phone is required").regex(US_PHONE, "Use format (555) 555-5555"),
  email:           z.string().email("Invalid email").or(z.literal("")).optional(),
  address:         z.string().optional(),
  city:            z.string().optional(),
  state:           z.string().regex(US_STATE, "Use 2-letter code (e.g. TX)").or(z.literal("")).optional(),
  zipCode:         z.string().regex(US_ZIP, "Use 5-digit zip (e.g. 78701)").or(z.literal("")).optional(),
  parentName:      z.string().min(1, "Parent/guardian name is required"),
  parentRelation:  z.enum(["Mother", "Father", "Guardian", "Grandparent", "Other"]).optional(),
  parentPhone:     z.string().regex(US_PHONE, "Use format (555) 555-5555").or(z.literal("")).optional(),
  parentEmail:     z.string().email("Invalid email").or(z.literal("")).optional(),
  parent2Name:     z.string().optional(),
  parent2Relation: z.enum(["Mother", "Father", "Guardian", "Grandparent", "Other"]).optional(),
  parentPhone2:    z.string().regex(US_PHONE, "Use format (555) 555-5555").or(z.literal("")).optional(),
  parent2Email:    z.string().email("Invalid email").or(z.literal("")).optional(),
  emergencyContact: z.string().optional(),
  emergencyPhone:  z.string().regex(US_PHONE, "Use format (555) 555-5555").or(z.literal("")).optional(),
  insuranceProvider:  z.string().optional(),
  insuranceId:        z.string().optional(),
  insurancePlanType:  z.string().optional(),
  insurancePlan:      z.string().optional(),
  insuranceMemberId:  z.string().optional(),
  allergies:          z.string().optional(),
  medications:     z.string().optional(),
  medicalNotes:    z.string().optional(),
  preferredLanguage: z.string().default("English"),
});

type PatientFormValues = z.infer<typeof patientSchema>;

// ── Phone auto-format ─────────────────────────────────────────────────────────

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface AddPatientDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AddPatientDialog({ isOpen, onClose, onSuccess }: AddPatientDialogProps) {
  const { showToast } = useToast();
  const [medicalOpen, setMedicalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<PatientFormValues, unknown, PatientFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(patientSchema) as any,
    defaultValues: {
      firstName: "", lastName: "", dateOfBirth: "", phone: "", email: "",
      address: "", city: "", state: "", zipCode: "",
      parentName: "", parentPhone: "", parentEmail: "",
      parent2Name: "", parentPhone2: "", parent2Email: "",
      emergencyContact: "", emergencyPhone: "",
      insuranceProvider: "", insuranceId: "",
      insurancePlanType: "", insurancePlan: "", insuranceMemberId: "",
      allergies: "", medications: "", medicalNotes: "",
      preferredLanguage: "English",
    },
  });

  const selectedPlanType = form.watch("insurancePlanType");
  const availablePlans = selectedPlanType && selectedPlanType in ALL_PLANS
    ? ALL_PLANS[selectedPlanType as keyof typeof ALL_PLANS]
    : [];

  async function onSubmit(values: PatientFormValues) {
    setIsSubmitting(true);
    try {
      const payload = {
        ...values,
        dateOfBirth: new Date(values.dateOfBirth).toISOString(),
        firstName:  values.firstName.trim(),
        lastName:   values.lastName.trim(),
        parentName: values.parentName.trim(),
      };

      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      showToast("Patient added successfully", "success");
      onSuccess();
      form.reset();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add patient", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose() {
    if (!isSubmitting) { form.reset(); onClose(); }
  }

  // ── Section heading ──────────────────────────────────────────────────────
  const SectionHeading = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2 mb-4">
      {children}
    </h3>
  );

  // ── Required label asterisk ──────────────────────────────────────────────
  const Req = () => <span className="text-red-500 ml-0.5">*</span>;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Patient</DialogTitle>
          <DialogDescription>
            Enter patient information to create a new record
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-2">

            {/* ── Section 1: Patient Information ────────────────────────── */}
            <div>
              <SectionHeading>Patient Information</SectionHeading>
              <div className="space-y-4">

                {/* firstName + lastName */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="firstName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name<Req /></FormLabel>
                      <FormControl><Input placeholder="Liam" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="lastName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name<Req /></FormLabel>
                      <FormControl><Input placeholder="Martinez" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* dateOfBirth + gender */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date of Birth<Req /></FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          max={new Date().toISOString().split("T")[0]}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="gender" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender</FormLabel>
                      <Select onValueChange={(value) => {
                        if (value) field.onChange(value);
                      }} value={field.value ?? ""}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="MALE">Male</SelectItem>
                          <SelectItem value="FEMALE">Female</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                          <SelectItem value="PREFER_NOT_TO_SAY">Prefer not to say</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* preferredLanguage */}
                <FormField control={form.control} name="preferredLanguage" render={({ field }) => (
                  <FormItem className="w-1/2">
                    <FormLabel>Preferred Language</FormLabel>
                    <Select onValueChange={(value) => {
                      if (value) field.onChange(value);
                    }} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="English">English</SelectItem>
                        <SelectItem value="Spanish">Spanish</SelectItem>
                        <SelectItem value="French">French</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* ── Section 2: Contact Information ────────────────────────── */}
            <div>
              <SectionHeading>Contact Information</SectionHeading>
              <div className="space-y-4">

                {/* phone + email */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone<Req /></FormLabel>
                      <FormControl>
                        <Input
                          placeholder="(555) 555-5555"
                          value={field.value}
                          onChange={(e) => field.onChange(formatPhone(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input placeholder="parent@email.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* address */}
                <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl><Input placeholder="123 Main Street" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* city + state + zip */}
                <div className="grid grid-cols-3 gap-4">
                  <FormField control={form.control} name="city" render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl><Input placeholder="Austin" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="state" render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="TX"
                          maxLength={2}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="zipCode" render={({ field }) => (
                    <FormItem>
                      <FormLabel>ZIP Code</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="78701"
                          maxLength={10}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value.replace(/[^0-9-]/, ""))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>
            </div>

            {/* ── Section 3: Parent / Guardian ──────────────────────────── */}
            <div>
              <SectionHeading>Parent / Guardian</SectionHeading>
              <div className="space-y-4">

                {/* parentName + parentRelation */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="parentName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Parent / Guardian Name<Req /></FormLabel>
                      <FormControl><Input placeholder="Carlos Martinez" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="parentRelation" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Relationship</FormLabel>
                      <Select onValueChange={(value) => {
                        if (value) field.onChange(value);
                      }} value={field.value ?? ""}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select relation" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Mother">Mother</SelectItem>
                          <SelectItem value="Father">Father</SelectItem>
                          <SelectItem value="Guardian">Guardian</SelectItem>
                          <SelectItem value="Grandparent">Grandparent</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* parentPhone + parentEmail */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="parentPhone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Parent Phone</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="(555) 555-5555"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(formatPhone(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="parentEmail" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Parent Email</FormLabel>
                      <FormControl><Input placeholder="parent@email.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* emergencyContact + emergencyPhone */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="emergencyContact" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Emergency Contact</FormLabel>
                      <FormControl><Input placeholder="Full name" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="emergencyPhone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Emergency Phone</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="(555) 555-5555"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(formatPhone(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>
            </div>

            {/* ── Section 3b: Second Parent / Guardian (optional) ───────── */}
            <div>
              <SectionHeading>Second Parent / Guardian <span className="font-normal text-slate-400">(optional)</span></SectionHeading>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="parent2Name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl><Input placeholder="Full name" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="parent2Relation" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Relationship</FormLabel>
                      <Select onValueChange={(value) => {
                        if (value) field.onChange(value);
                      }} value={field.value ?? ""}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select relation" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Mother">Mother</SelectItem>
                          <SelectItem value="Father">Father</SelectItem>
                          <SelectItem value="Guardian">Guardian</SelectItem>
                          <SelectItem value="Grandparent">Grandparent</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="parentPhone2" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="(555) 555-5555"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(formatPhone(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="parent2Email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input placeholder="parent2@email.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>
            </div>

            {/* ── Section 4: Medical Information (collapsible) ──────────── */}
            <div>
              <button
                type="button"
                onClick={() => setMedicalOpen((o) => !o)}
                className="flex items-center justify-between w-full text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2 mb-4 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                <span>Medical Information <span className="font-normal text-slate-400">(optional)</span></span>
                {medicalOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {medicalOpen && (
                <div className="space-y-4">
                  {/* insuranceProvider + insuranceId */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="insuranceProvider" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Insurance Provider</FormLabel>
                        <FormControl><Input placeholder="Blue Cross Blue Shield" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="insuranceId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Policy / Member ID</FormLabel>
                        <FormControl><Input placeholder="BCBS-TX-123456" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* insurancePlanType + insurancePlan */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="insurancePlanType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Plan Type</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value);
                            form.setValue("insurancePlan", "");
                          }}
                          value={field.value ?? ""}
                        >
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {PLAN_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="insurancePlan" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Plan Name</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value)}
                          value={field.value ?? ""}
                          disabled={availablePlans.length === 0}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={availablePlans.length === 0 ? "Select type first" : "Select plan"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availablePlans.map((p) => (
                              <SelectItem key={p} value={p}>{p}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* insuranceMemberId */}
                  <FormField control={form.control} name="insuranceMemberId" render={({ field }) => (
                    <FormItem className="w-1/2">
                      <FormLabel>Insurance Member ID</FormLabel>
                      <FormControl><Input placeholder="e.g. XYZ123456789" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* allergies */}
                  <FormField control={form.control} name="allergies" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Allergies</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="List known allergies (medications, food, environmental)..."
                          className="resize-none"
                          rows={2}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* medications */}
                  <FormField control={form.control} name="medications" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Medications</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="List current medications and dosages..."
                          className="resize-none"
                          rows={2}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* medicalNotes */}
                  <FormField control={form.control} name="medicalNotes" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Medical Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any additional medical history or notes..."
                          className="resize-none"
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              )}
            </div>

            {/* ── Footer ──────────────────────────────────────────────────── */}
            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="gap-2">
                {isSubmitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Adding Patient...</>
                ) : (
                  <><Plus className="h-4 w-4" /> Add Patient</>
                )}
              </Button>
            </DialogFooter>

          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
