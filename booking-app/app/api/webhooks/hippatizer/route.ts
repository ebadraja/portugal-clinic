/**
 * Hippatizer Webhook Receiver
 * HIPPAtizer sends a flat JSON object where field labels are keys.
 * System fields: "Form Name", "Submission Id", "Form Id", "Increment",
 *                "Submission Created Date (MM/dd/yyyy)"
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMappingForForm } from "@/lib/hippatizer/fieldMappings";
import { findBestPatientMatch, findPatientMatches, type PatientMatch } from "@/lib/hippatizer/patientMatcher";
import { logWebhook, logError } from "@/lib/logger";
import { appendSystemMessage } from "@/lib/messaging/systemMessages";

export const dynamic = "force-dynamic";

// Internal normalized payload after transforming HIPPAtizer's flat format
interface NormalizedPayload {
  form_id: string;
  submission_id: string;
  submission_counter: number;
  form_title: string;
  created_at: string;
  view_link: string | null;
  pdf_link: string | null;
  field_values: Record<string, string | boolean | null>;
}

function decryptApiKey(encrypted: string): string {
  try {
    const secret = process.env.ENCRYPTION_SECRET || 'default-secret-key';
    const decoded = Buffer.from(encrypted, 'base64').toString();
    let decrypted = '';
    for (let i = 0; i < decoded.length; i++) {
      decrypted += String.fromCharCode(decoded.charCodeAt(i) ^ secret.charCodeAt(i % secret.length));
    }
    return decrypted;
  } catch {
    return '';
  }
}

async function validateApiKey(request: NextRequest): Promise<boolean> {
  const apiKey = request.headers.get("X-Api-Key");
  if (!apiKey) return false;

  // Env-var fallback — works before Settings UI is configured
  const envKey = process.env.HIPPATIZER_API_KEY;
  if (envKey && apiKey === envKey) return true;

  const settings = await prisma.settings.findFirst();
  if (!settings || !settings.hippatizApiKey) return false;

  const storedKey = decryptApiKey(settings.hippatizApiKey);
  return apiKey === storedKey;
}

/**
 * Transform HIPPAtizer's flat payload into our normalized format.
 * HIPPAtizer sends: { "First Name": "John", "Form Name": "...", "Submission Id": "...", ... }
 */
function normalizePayload(raw: Record<string, string | null>): NormalizedPayload | null {
  const formTitle = raw["Form Name"] || "";
  const submissionId = raw["Submission Id"] || "";
  const formId = raw["Form Id"] || "";
  const increment = parseInt(raw["Increment"] || "0") || 0;

  if (!formTitle || !submissionId || !formId) return null;

  // Parse submission date
  let createdAt = new Date().toISOString();
  const dateStr = raw["Submission Created Date (MM/dd/yyyy)"];
  if (dateStr) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const parsed = new Date(`${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`);
      if (!isNaN(parsed.getTime())) createdAt = parsed.toISOString();
    }
  }

  return {
    form_id: formId,
    submission_id: submissionId,
    submission_counter: increment,
    form_title: formTitle,
    created_at: createdAt,
    view_link: raw["View Submission Link"] || null,
    pdf_link: raw["Download PDF Link"] || null,
    field_values: raw,
  };
}

// Keys HIPPAtizer always sends that are not patient data
const HIPPATIZER_SYSTEM_KEYS = new Set([
  "Form Name", "Form Id", "Submission Id", "Increment",
  "Submission Created Date (MM/dd/yyyy)", "View Submission Link", "Edit Submission Link",
  "Download PDF Link", "Download Access Log Link", "Download Merged PDF Link",
  "Download CSV Link", "Download Merged CSV Link", "Download Attachments Link",
  "Next Step Link", "Notification Template Settings Link", "Show Pdf Password Link",
  "Submissions Filtered Table Link", "Current Workflow Url", "Form Submission Limit",
  "Location Title", "Location Address", "Location Email", "Location Phone",
  "Profile Business Name", "Profile Business Address", "Profile Business Address 2",
  "Profile Business City", "Profile Business State", "Profile Business Zip",
  "Profile Business Phone", "Profile Business Fax", "Profile Business Email",
  "Date Today (MM/dd/yyyy)", "Date Today (MM-dd-yyyy)", "Date Today (MM.dd.yyyy HH:mm)",
  "Date Today (dd-MM-yyyy)", "Date Today (dd/MM/yyyy)", "Date Today (yyyy-MM-dd)",
  "Date Today (yyyy/MM/dd)", "Date Today (yyMMddHHmmss)", "Date Today (MMddyyHHmmss)",
  "Previous Year (MM/dd/yyyy)", "Time Now (hh:mm tt)",
]);

// Capture every meaningful field from the payload — no mapping required
function getAllFields(
  fieldValues: Record<string, string | boolean | null>
): Array<{ fieldId: string; fieldLabel: string; fieldType: string; value: string }> {
  const result = [];
  for (const [key, value] of Object.entries(fieldValues)) {
    if (HIPPATIZER_SYSTEM_KEYS.has(key)) continue;
    if (key.startsWith("paragraph_")) continue;
    if (key.endsWith(" (Strip Html)") || key.endsWith(" (Html)")) continue;
    if (key.endsWith(" (Labels)") || key.endsWith(" (Values)")) continue;
    if (value === null || value === undefined || value === "") continue;
    result.push({ fieldId: key, fieldLabel: key, fieldType: "text", value: String(value) });
  }
  return result;
}

// Use field mappings only for extracting structured patient data (matching/drafts)
function extractPatientData(
  formTitle: string,
  fieldValues: Record<string, string | boolean | null>
) {
  const mappings = getMappingForForm(formTitle);
  const extracted: Record<string, any> = {};

  for (const mapping of mappings) {
    const value = fieldValues[mapping.hippatizFieldId];
    if (value !== undefined && value !== null && value !== "") {
      extracted[mapping.patientField] = mapping.transform ? mapping.transform(value) : value;
    }
  }

  return { extracted };
}

function hasCriticalFields(extracted: Record<string, any>): boolean {
  return !!(extracted.firstName && extracted.lastName) || !!extracted.patientFullName;
}

export async function processWebhookPayload(payload: NormalizedPayload) {
  const { form_id, submission_id, form_title, created_at, view_link, pdf_link, field_values } = payload;

  const existingForm = await prisma.intakeForm.findUnique({
    where: { hippatizerId: submission_id },
  });

  if (existingForm) {
    return { success: false, message: "Duplicate submission", formId: existingForm.id };
  }

  const { extracted } = extractPatientData(form_title, field_values);
  const allFields = getAllFields(field_values);

  const DRAFT_FORM_TITLES = ["NEW PATIENT PRE-REGISTRATION", "KIDS PATIENT INTAKE FORM"];
  const titleUpperEarly = form_title.trim().toUpperCase();
  const isDraftForm = DRAFT_FORM_TITLES.some(t => titleUpperEarly.includes(t) || t.includes(titleUpperEarly));

  if (!hasCriticalFields(extracted)) {
    const intakeForm = await prisma.intakeForm.create({
      data: {
        hippatizerId: submission_id,
        hippatizFormId: form_id,
        hippatizFormTitle: form_title,
        hippatizViewLink: view_link,
        hippatizPdfLink: pdf_link,
        submittedAt: new Date(created_at),
        status: "RECEIVED",
        fieldValues: {
          create: allFields.map((f) => ({
            fieldId: f.fieldId,
            fieldLabel: f.fieldLabel,
            fieldType: f.fieldType,
            value: f.value,
          })),
        },
      },
      include: { fieldValues: true },
    });

    // For pre-reg/intake forms, still create a draft even when field extraction fails
    // (staff can fill in the details manually)
    if (isDraftForm) {
      const adminUser = await prisma.user.findFirst({
        where: { role: "ADMIN", isActive: true },
        select: { id: true },
      });
      if (adminUser) {
        const draft = await prisma.patientDraft.create({
          data: {
            firstName: extracted.firstName || extracted.childName || "Unknown",
            lastName: extracted.lastName || "Unknown",
            dateOfBirth: extracted.dateOfBirth || new Date(),
            email: extracted.email,
            phone: extracted.phone,
            gender: extracted.gender,
            preferredLanguage: extracted.preferredLanguage,
            streetAddress: extracted.streetAddress,
            city: extracted.city,
            state: extracted.state,
            zipCode: extracted.zipCode,
            status: "PENDING",
            createdById: adminUser.id,
          },
        });
        await prisma.intakeForm.update({
          where: { id: intakeForm.id },
          data: { patientDraftId: draft.id, status: "DRAFT" },
        });
      }
    }

    await createFormSubmissionNotifications(intakeForm.id, isDraftForm ? "DRAFT" : "RECEIVED", extracted);

    return {
      success: true,
      formId: intakeForm.id,
      status: isDraftForm ? "DRAFT" : "RECEIVED",
      message: isDraftForm
        ? "Form received. Draft created with partial data — please complete manually."
        : "Form received but missing critical fields for matching",
    };
  }

  let bestMatch = null;
  let potentialMatches: PatientMatch[] = [];

  if (extracted.firstName && extracted.lastName && extracted.dateOfBirth) {
    bestMatch = await findBestPatientMatch(
      extracted.firstName,
      extracted.lastName,
      extracted.dateOfBirth,
      extracted.email,
      extracted.phone,
      0.85
    );

    if (!bestMatch) {
      potentialMatches = await findPatientMatches(
        extracted.firstName,
        extracted.lastName,
        extracted.dateOfBirth,
        extracted.email,
        extracted.phone
      );
    }
  }

  let intakeFormStatus: "RECEIVED" | "MATCHED" | "DRAFT" | "LINKED" | "ARCHIVED" = "RECEIVED";
  let linkedPatientId = null;
  let linkedAt = null;

  if (bestMatch) {
    intakeFormStatus = "MATCHED";
    linkedPatientId = bestMatch.patientId;
    linkedAt = new Date();
  }

  const intakeForm = await prisma.intakeForm.create({
    data: {
      hippatizerId: submission_id,
      hippatizFormId: form_id,
      hippatizFormTitle: form_title,
      hippatizViewLink: view_link,
      hippatizPdfLink: pdf_link,
      submittedAt: new Date(created_at),
      status: intakeFormStatus,
      patientId: linkedPatientId,
      linkedAt,
      matchConfidence: bestMatch?.confidence ?? null,
      matchNotes: bestMatch?.matchReasons.join(", ") ?? null,
      fieldValues: {
        create: allFields.map((f) => ({
          fieldId: f.fieldId,
          fieldLabel: f.fieldLabel,
          fieldType: f.fieldType,
          value: String(f.value),
        })),
      },
    },
    include: {
      fieldValues: true,
      patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
    },
  });

  // Only pre-registration and intake forms create patient drafts
  if (!bestMatch && intakeFormStatus === "RECEIVED" && isDraftForm) {
    // Find the first admin user to satisfy the foreign key constraint
    const adminUser = await prisma.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    if (!adminUser) {
      // No admin user exists yet — store form as RECEIVED without draft
      return {
        success: true,
        formId: intakeForm.id,
        status: "RECEIVED",
        message: "Form received. No admin user found to assign draft.",
      };
    }

    const draft = await prisma.patientDraft.create({
      data: {
        firstName: extracted.firstName || "Unknown",
        lastName: extracted.lastName || "Unknown",
        dateOfBirth: extracted.dateOfBirth || new Date(),
        email: extracted.email,
        phone: extracted.phone,
        middleInitial: extracted.middleInitial,
        gender: extracted.gender,
        preferredPronouns: extracted.preferredPronouns,
        preferredLanguage: extracted.preferredLanguage,
        streetAddress: extracted.streetAddress,
        city: extracted.city,
        state: extracted.state,
        zipCode: extracted.zipCode,
        caregiver1FirstName: extracted.caregiver1FirstName,
        caregiver1LastName: extracted.caregiver1LastName,
        caregiver1Relationship: extracted.caregiver1Relationship,
        caregiver1Phone: extracted.caregiver1Phone,
        caregiver1Email: extracted.caregiver1Email,
        caregiver2FirstName: extracted.caregiver2FirstName,
        caregiver2LastName: extracted.caregiver2LastName,
        caregiver2Relationship: extracted.caregiver2Relationship,
        caregiver2Phone: extracted.caregiver2Phone,
        caregiver2Email: extracted.caregiver2Email,
        pcpName: extracted.pcpName,
        pcpClinicName: extracted.pcpClinicName,
        pcpPhone: extracted.pcpPhone,
        status: "PENDING",
        createdById: adminUser.id,
      },
    });

    await prisma.intakeForm.update({
      where: { id: intakeForm.id },
      data: { patientDraftId: draft.id, status: "DRAFT" },
    });
  }

  await prisma.auditLog.create({
    data: {
      action: "CREATE",
      entity: "intake_form",
      entityId: intakeForm.id,
      changes: { status: intakeFormStatus, formTitle: form_title, matched: !!bestMatch },
      ipAddress: null,
    },
  });

  await createFormSubmissionNotifications(intakeForm.id, intakeFormStatus, extracted);

  if (linkedPatientId) {
    void appendSystemMessage({
      patientId: linkedPatientId,
      content: `Intake form completed: ${form_title}`,
      metadata: {
        source: 'hippatizer',
        formId: intakeForm.id,
        viewLink: view_link,
        status: intakeFormStatus,
      },
    }).catch((err) => logError("hippatizer system message failed", err));
  }

  return {
    success: true,
    formId: intakeForm.id,
    status: intakeFormStatus,
    matchedPatientId: linkedPatientId,
    potentialMatches: potentialMatches.slice(0, 3),
    message: bestMatch
      ? "Form auto-matched to existing patient"
      : "Form created. No auto-match found.",
  };
}

async function createFormSubmissionNotifications(
  formId: string,
  status: string,
  extractedData: Record<string, any>
) {
  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    const staffWithAccess = await prisma.user.findMany({
      where: { intakeFormAccessControl: { canView: true }, isActive: true },
      select: { id: true },
    });

    const recipientIds = new Set([
      ...admins.map((a) => a.id),
      ...staffWithAccess.map((s) => s.id),
    ]);

    const patientName = `${extractedData.firstName || ""} ${extractedData.lastName || ""}`.trim()
      || extractedData.patientFullName
      || "Unknown";

    for (const userId of recipientIds) {
      await prisma.notification.create({
        data: {
          userId,
          type: "form_submitted",
          title: "New Intake Form Received",
          message:
            status === "MATCHED"
              ? `New intake form from ${patientName} has been matched to an existing patient`
              : `New intake form from ${patientName} is ready for review and matching`,
          icon: "form",
          entityType: "intake_form",
          entityId: formId,
          actionUrl: `/intake-forms/${formId}`,
        },
      });
    }
  } catch (error) {
    logError("notification_creation", error, { formId, status });
  }
}

export async function POST(request: NextRequest) {
  logWebhook("hippatizer", "received", {
    hasApiKey: !!request.headers.get("X-Api-Key"),
  });

  try {
    const isValid = await validateApiKey(request);
    if (!isValid) {
      logWebhook("hippatizer", "rejected_unauthorized", {});
      return NextResponse.json({ error: "Unauthorized: Invalid API key" }, { status: 401 });
    }

    let rawPayload: Record<string, string | null>;
    try {
      rawPayload = await request.json();
    } catch {
      logWebhook("hippatizer", "rejected_invalid_json", {});
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const payload = normalizePayload(rawPayload);
    if (!payload) {
      logWebhook("hippatizer", "rejected_missing_fields", {
        formName: rawPayload["Form Name"] ?? null,
      });
      return NextResponse.json(
        { error: "Missing required fields: Form Name, Submission Id, Form Id" },
        { status: 400 }
      );
    }

    const result = await processWebhookPayload(payload);

    logWebhook("hippatizer", "processed", {
      formTitle: payload.form_title,
      submissionId: payload.submission_id,
      success: result.success,
      status: "status" in result ? result.status : null,
      formId: result.formId ?? null,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 409 });
  } catch (error) {
    logError("hippatizer_webhook", error);
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "Hippatizer webhook receiver is running",
    timestamp: new Date().toISOString(),
  });
}
