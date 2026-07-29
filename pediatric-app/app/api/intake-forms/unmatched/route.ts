/**
 * GET /api/intake-forms/unmatched
 * List intake forms that haven't been matched to patients or drafts yet
 * These are forms ready for manual review and patient creation
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user has intake form access
    const accessControl = await prisma.intakeFormAccessControl.findUnique({
      where: { userId: session.user.id },
    });

    if (session.user.role !== "ADMIN" && !accessControl?.canView) {
      return NextResponse.json(
        { error: "Forbidden: No intake form access" },
        { status: 403 }
      );
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const search = searchParams.get("search") || "";

    // Build filters: unmatched forms have status RECEIVED and no patientDraftId
    const filters: any = {
      status: "RECEIVED",
      patientDraftId: null,
    };

    // Search by patient name or email from form fields
    if (search) {
      // This is a simplified search - in production, you'd extract specific fields
      filters.hippatizFormTitle = {
        contains: search,
        mode: "insensitive",
      };
    }

    // Get total count
    const total = await prisma.intakeForm.count({ where: filters });

    // Get paginated results with all field values
    const forms = await prisma.intakeForm.findMany({
      where: filters,
      include: {
        fieldValues: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { submittedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Transform response to include extracted patient info
    const data = forms.map((form) => {
      // Extract key patient fields from field values
      const extractedData: Record<string, string | null> = {};

      form.fieldValues.forEach((field) => {
        const label = field.fieldLabel?.toLowerCase() || "";
        if (label.includes("first name") && label.includes("patient")) {
          extractedData.firstName = field.value;
        } else if (label.includes("last name") && label.includes("patient")) {
          extractedData.lastName = field.value;
        } else if (label.includes("date of birth")) {
          extractedData.dateOfBirth = field.value;
        } else if (label.includes("email")) {
          extractedData.email = field.value;
        } else if (label.includes("phone")) {
          extractedData.phone = field.value;
        } else if (label.includes("parent") && label.includes("first name")) {
          extractedData.parentFirstName = field.value;
        } else if (label.includes("parent") && label.includes("last name")) {
          extractedData.parentLastName = field.value;
        } else if (label.includes("parent") && label.includes("phone")) {
          extractedData.parentPhone = field.value;
        } else if (label.includes("parent") && label.includes("email")) {
          extractedData.parentEmail = field.value;
        } else if (label.includes("gender")) {
          extractedData.gender = field.value;
        } else if (label.includes("address") || label.includes("street")) {
          extractedData.address = field.value;
        } else if (label.includes("city")) {
          extractedData.city = field.value;
        } else if (label.includes("state")) {
          extractedData.state = field.value;
        } else if (label.includes("zip")) {
          extractedData.zipCode = field.value;
        }
      });

      return {
        id: form.id,
        hippatizFormTitle: form.hippatizFormTitle,
        submittedAt: form.submittedAt.toISOString(),
        extractedData,
        fieldCount: form.fieldValues.length,
      };
    });

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching unmatched forms:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
