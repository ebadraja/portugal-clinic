/**
 * POST /api/intake-forms/[id]/match-patient
 * Manually link an intake form to an existing patient
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

    // Check access
    const accessControl = await prisma.intakeFormAccessControl.findUnique({
      where: { userId: session.user.id },
    });

    if (session.user.role !== "ADMIN" && !accessControl?.canMatch) {
      return NextResponse.json(
        { error: "Forbidden: No permission to match forms" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { patientId, confidence, notes } = body;

    if (!patientId) {
      return NextResponse.json(
        { error: "patientId is required" },
        { status: 400 }
      );
    }

    // Verify patient exists
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    // Update intake form
    const updated = await prisma.intakeForm.update({
      where: { id },
      data: {
        patientId,
        status: "LINKED",
        linkedAt: new Date(),
        matchConfidence: confidence || 0.95,
        matchNotes: notes || "Manually matched by staff",
        processedAt: new Date(),
        processedById: session.user.id,
        // Remove from draft if it was there
        patientDraftId: null,
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "UPDATE",
        entity: "intake_form",
        entityId: id,
        changes: {
          action: "matched_to_patient",
          patientId,
          notes,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Form linked to patient ${patient.firstName} ${patient.lastName}`,
      form: updated,
    });
  } catch (error) {
    console.error("Error matching form:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
