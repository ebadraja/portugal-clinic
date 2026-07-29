import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

async function checkAccess(session: any) {
  if (!session?.user?.id) return false;
  if (session.user.role === "ADMIN") return true;
  const ac = await prisma.intakeFormAccessControl.findUnique({ where: { userId: session.user.id } });
  return !!ac?.canView;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!await checkAccess(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const page = parseInt(sp.get("page") || "1", 10);
    const limit = parseInt(sp.get("limit") || "20", 10);
    const status = sp.get("status");
    const search = sp.get("search") || "";
    const trash = sp.get("trash") === "true";
    const linkedPatientId = sp.get("linkedPatientId");
    const formType = sp.get("formType") || "";

    const filters: any = {};

    // Trash view shows only soft-deleted; default hides them
    if (trash) {
      filters.deletedAt = { not: null };
    } else {
      filters.deletedAt = null;
    }

    if (!trash && status) filters.status = status;
    if (linkedPatientId) filters.patientId = linkedPatientId;
    if (formType) filters.hippatizFormTitle = { equals: formType, mode: "insensitive" };

    if (search) {
      filters.OR = [
        { patient: { firstName: { contains: search, mode: "insensitive" } } },
        { patient: { lastName: { contains: search, mode: "insensitive" } } },
        { patientDraft: { firstName: { contains: search, mode: "insensitive" } } },
        { patientDraft: { lastName: { contains: search, mode: "insensitive" } } },
      ];
    }

    const total = await prisma.intakeForm.count({ where: filters });

    const forms = await prisma.intakeForm.findMany({
      where: filters,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        patientDraft: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { submittedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    const data = forms.map((form) => ({
      id: form.id,
      hippatizFormTitle: form.hippatizFormTitle,
      hippatizViewLink: form.hippatizViewLink,
      hippatizPdfLink: form.hippatizPdfLink,
      status: form.status,
      matchConfidence: form.matchConfidence,
      submittedAt: form.submittedAt.toISOString(),
      deletedAt: form.deletedAt?.toISOString() ?? null,
      linkedPatientId: form.patientId,
      linkedPatientName: form.patient ? `${form.patient.firstName} ${form.patient.lastName}` : null,
      draftPatientId: form.patientDraftId,
      draftPatientName: form.patientDraft ? `${form.patientDraft.firstName} ${form.patientDraft.lastName}` : null,
    }));

    return NextResponse.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("Error fetching intake forms:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/intake-forms — bulk operations
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { action, ids } = await request.json();
    if (!action || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "action and ids required" }, { status: 400 });
    }

    if (action === "trash") {
      await prisma.intakeForm.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } });
    } else if (action === "restore") {
      await prisma.intakeForm.updateMany({ where: { id: { in: ids } }, data: { deletedAt: null } });
    } else if (action === "delete") {
      await prisma.intakeForm.deleteMany({ where: { id: { in: ids } } });
    } else if (action === "archive") {
      await prisma.intakeForm.updateMany({ where: { id: { in: ids } }, data: { status: "ARCHIVED", deletedAt: null } });
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ success: true, count: ids.length });
  } catch (error) {
    console.error("Bulk action error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
