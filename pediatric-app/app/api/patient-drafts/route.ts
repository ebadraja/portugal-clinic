/**
 * GET/POST /api/patient-drafts
 * GET: List draft patients
 * POST: Create new draft from intake form
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

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const status = searchParams.get("status");
    const search = searchParams.get("search") || "";

    const filters: any = {};

    if (status) {
      filters.status = status;
    }

    if (search) {
      filters.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const total = await prisma.patientDraft.count({ where: filters });

    const drafts = await prisma.patientDraft.findMany({
      where: filters,
      include: {
        intakeForms: {
          select: {
            id: true,
            hippatizFormTitle: true,
            submittedAt: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    const data = drafts.map((draft) => ({
      id: draft.id,
      firstName: draft.firstName,
      lastName: draft.lastName,
      email: draft.email,
      phone: draft.phone,
      dateOfBirth: draft.dateOfBirth.toISOString(),
      status: draft.status,
      intakeFormCount: draft.intakeForms.length,
      createdAt: draft.createdAt.toISOString(),
      createdBy: draft.createdBy,
    }));

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
    console.error("Error fetching drafts:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const {
      intakeFormId,
      firstName,
      lastName,
      dateOfBirth,
      email,
      phone,
      ...otherData
    } = body;

    // If creating from intake form
    if (intakeFormId) {
      const form = await prisma.intakeForm.findUnique({
        where: { id: intakeFormId },
      });

      if (!form) {
        return NextResponse.json(
          { error: "Intake form not found" },
          { status: 404 }
        );
      }

      if (form.patientDraftId) {
        return NextResponse.json(
          { error: "Draft already exists for this form" },
          { status: 409 }
        );
      }
    }

    const draft = await prisma.patientDraft.create({
      data: {
        firstName,
        lastName,
        dateOfBirth: new Date(dateOfBirth),
        email,
        phone,
        ...otherData,
        createdById: session.user.id,
        status: "PENDING",
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

    // Link intake form if provided
    if (intakeFormId) {
      await prisma.intakeForm.update({
        where: { id: intakeFormId },
        data: {
          patientDraftId: draft.id,
          status: "DRAFT",
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        message: "Draft patient created",
        draft,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating draft:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
