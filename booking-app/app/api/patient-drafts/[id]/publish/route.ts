/**
 * POST /api/patient-drafts/[id]/publish
 * Convert draft patient to real patient record
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check publish permission
    const accessControl = await prisma.intakeFormAccessControl.findUnique({
      where: { userId: session.user.id },
    });

    if (session.user.role !== "ADMIN" && !accessControl?.canPublish) {
      return NextResponse.json(
        { error: "Forbidden: No permission to publish drafts" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { notes } = body;

    // Get draft
    const draft = await prisma.patientDraft.findUnique({
      where: { id },
      include: {
        intakeForms: true,
      },
    });

    if (!draft) {
      return NextResponse.json(
        { error: "Draft patient not found" },
        { status: 404 }
      );
    }

    if (draft.status === "PUBLISHED") {
      return NextResponse.json(
        { error: "Draft already published" },
        { status: 409 }
      );
    }

    // Create real patient from draft
    const newPatient = await prisma.patient.create({
      data: {
        firstName: draft.firstName,
        lastName: draft.lastName,
        dateOfBirth: draft.dateOfBirth,
        email: draft.email,
        phone: draft.phone,
        gender: draft.gender as any,
        address: draft.streetAddress || undefined,
        city: draft.city,
        state: draft.state,
        zipCode: draft.zipCode,
        parentName: draft.caregiver1FirstName && draft.caregiver1LastName 
          ? `${draft.caregiver1FirstName} ${draft.caregiver1LastName}`
          : undefined,
        parentRelation: draft.caregiver1Relationship,
        parentPhone: draft.caregiver1Phone,
        parentEmail: draft.caregiver1Email,
        preferredLanguage: draft.preferredLanguage || "English",
        createdById: session.user.id,
      },
    });

    // Link all intake forms to new patient
    await Promise.all(
      draft.intakeForms.map((form) =>
        prisma.intakeForm.update({
          where: { id: form.id },
          data: {
            patientId: newPatient.id,
            patientDraftId: null,
            status: "LINKED",
            linkedAt: new Date(),
            processedAt: new Date(),
            processedById: session.user.id,
          },
        })
      )
    );

    // Update draft status
    const updatedDraft = await prisma.patientDraft.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        publishedById: session.user.id,
      },
      include: {
        intakeForms: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CREATE",
        entity: "patient",
        entityId: newPatient.id,
        changes: {
          source: "draft_patient",
          draftId: id,
          reason: notes,
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: `Draft published as patient ${newPatient.firstName} ${newPatient.lastName}`,
        patient: newPatient,
        draft: updatedDraft,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error publishing draft:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/patient-drafts/[id]
 * Get draft details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const draft = await prisma.patientDraft.findUnique({
      where: { id },
      include: {
        intakeForms: {
          include: {
            fieldValues: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        publishedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!draft) {
      return NextResponse.json(
        { error: "Draft patient not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(draft);
  } catch (error) {
    console.error("Error fetching draft:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
