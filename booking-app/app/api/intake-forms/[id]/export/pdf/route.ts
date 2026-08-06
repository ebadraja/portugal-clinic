/**
 * GET /api/intake-forms/[id]/export/pdf
 * Export intake form to PDF document
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

// Using a simple text-based PDF generation approach
// In production, consider using: pdfkit, jsPDF, or Puppeteer
function generatePdfContent(
  formTitle: string,
  submittedAt: Date,
  fieldValues: Array<{ fieldLabel?: string; value?: string }>
): string {
  const lines: string[] = [];

  // PDF header
  lines.push("%PDF-1.4");
  lines.push("1 0 obj");
  lines.push("<< /Type /Catalog /Pages 2 0 R >>");
  lines.push("endobj");
  lines.push("2 0 obj");
  lines.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  lines.push("endobj");
  lines.push("3 0 obj");
  lines.push(
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"
  );
  lines.push("endobj");

  // Build content stream
  const contentLines: string[] = [];
  contentLines.push("BT");
  contentLines.push("/F1 24 Tf");
  contentLines.push("50 750 Td");
  contentLines.push(`(${escapeText(formTitle)}) Tj`);
  contentLines.push("0 -30 Td");
  contentLines.push("/F1 10 Tf");
  contentLines.push(
    `(Submitted: ${submittedAt.toLocaleDateString()} ${submittedAt.toLocaleTimeString()}) Tj`
  );
  contentLines.push("0 -20 Td");
  contentLines.push("(---) Tj");
  contentLines.push("0 -15 Td");

  let yOffset = 0;
  fieldValues.forEach((field) => {
    if (field.fieldLabel && field.value) {
      contentLines.push(`(${escapeText(field.fieldLabel)}: ) Tj`);
      contentLines.push("ET");
      contentLines.push("BT");
      contentLines.push("/F1 9 Tf");
      contentLines.push("0 -12 Td");
      contentLines.push(`(${escapeText(field.value)}) Tj`);
      contentLines.push("0 -10 Td");
      yOffset += 22;
    }
  });

  contentLines.push("ET");

  const content = contentLines.join("\n");
  const contentLength = Buffer.byteLength(content, "utf8");

  lines.push("4 0 obj");
  lines.push(`<< /Length ${contentLength} >>`);
  lines.push("stream");
  lines.push(content);
  lines.push("endstream");
  lines.push("endobj");

  // Font resource
  lines.push("5 0 obj");
  lines.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  lines.push("endobj");

  // Xref table
  const xrefOffset = lines.join("\n").length;
  lines.push("xref");
  lines.push("0 6");
  lines.push("0000000000 65535 f");
  lines.push("0000000009 00000 n");
  lines.push("0000000058 00000 n");
  lines.push("0000000115 00000 n");
  lines.push(`${String(xrefOffset).padStart(10, "0")} 00000 n`);
  lines.push(`${String(xrefOffset + contentLength + 100).padStart(10, "0")} 00000 n`);

  lines.push("trailer");
  lines.push("<< /Size 6 /Root 1 0 R >>");
  lines.push("startxref");
  lines.push(String(xrefOffset));
  lines.push("%%EOF");

  return lines.join("\n");
}

function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n]/g, " ");
}

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

    // Check access
    const accessControl = await prisma.intakeFormAccessControl.findUnique({
      where: { userId: session.user.id },
    });

    if (session.user.role !== "ADMIN" && !accessControl?.canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get form with all details
    const form = await prisma.intakeForm.findUnique({
      where: { id },
      include: {
        fieldValues: true,
        patient: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }

    // Generate PDF
    const pdfContent = generatePdfContent(
      form.hippatizFormTitle,
      form.submittedAt,
      form.fieldValues.map(field => ({
        fieldLabel: field.fieldLabel ?? undefined,
        value: field.value ?? undefined,
      }))
    );

    // Audit log: PDF export
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "READ",
        entity: "intake_form_export",
        entityId: form.id,
      },
    });

    // Return PDF
    return new NextResponse(pdfContent, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${form.hippatizFormTitle.replace(/ /g, "_")}_${form.id.slice(0, 8)}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error exporting form to PDF:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
