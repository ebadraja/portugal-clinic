import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

/**
 * POST /api/seed/sample-draft-patient
 * Admin-only endpoint to create a sample intake form for testing
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    // Admin check
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if sample intake form already exists by hippatizer ID
    const existing = await prisma.intakeForm.findFirst({
      where: {
        hippatizerId: "sample-emma-johnson-001",
      },
    });

    if (existing) {
      return NextResponse.json(
        { message: "Sample intake form already exists", id: existing.id },
        { status: 200 }
      );
    }

    // Create sample intake form
    const sampleForm = await prisma.intakeForm.create({
      data: {
        hippatizerId: "sample-emma-johnson-001",
        hippatizFormId: "form-well-child-visit",
        hippatizFormTitle: "Well Child Visit - Emma Johnson",
        status: "RECEIVED",
        submittedAt: new Date(),
        fieldValues: {
          create: [
            {
              fieldId: "first_name",
              fieldLabel: "First Name",
              fieldType: "text",
              value: "Emma",
            },
            {
              fieldId: "last_name",
              fieldLabel: "Last Name",
              fieldType: "text",
              value: "Johnson",
            },
            {
              fieldId: "date_of_birth",
              fieldLabel: "Date of Birth",
              fieldType: "date",
              value: "2018-03-15",
            },
            {
              fieldId: "email",
              fieldLabel: "Email",
              fieldType: "email",
              value: "emma.johnson@example.com",
            },
            {
              fieldId: "phone",
              fieldLabel: "Phone",
              fieldType: "tel",
              value: "+1-555-123-4567",
            },
            {
              fieldId: "gender",
              fieldLabel: "Gender",
              fieldType: "select",
              value: "Female",
            },
            {
              fieldId: "parent_name",
              fieldLabel: "Parent Name",
              fieldType: "text",
              value: "Sarah Johnson",
            },
            {
              fieldId: "parent_phone",
              fieldLabel: "Parent Phone",
              fieldType: "tel",
              value: "+1-555-123-4568",
            },
            {
              fieldId: "address",
              fieldLabel: "Address",
              fieldType: "text",
              value: "123 Oak Street, Springfield, IL 62701",
            },
          ],
        },
      },
      include: { fieldValues: true },
    });

    return NextResponse.json(
      {
        message: "Sample intake form created successfully",
        id: sampleForm.id,
        formTitle: sampleForm.hippatizFormTitle,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating sample intake form:", error);
    return NextResponse.json(
      { error: "Failed to create sample intake form" },
      { status: 500 }
    );
  }
}
