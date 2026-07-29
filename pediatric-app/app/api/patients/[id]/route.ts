import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@/lib/generated/prisma/client"
import prisma from "@/lib/prisma"

type RouteContext = { params: Promise<{ id: string }> }

// ── GET /api/patients/[id] ────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    const patient = await prisma.patient.findUnique({
      where: { id },
      include: {
        appointments: {
          orderBy: { startTime: "desc" },
          take: 50,
        },
        callLogs: {
          orderBy: { startTime: "desc" },
          take: 20,
        },
        chatLogs: {
          orderBy: { startTime: "desc" },
          take: 20,
        },
        notes: {
          include: {
            author: {
              select: { firstName: true, lastName: true, role: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        documents: {
          orderBy: { createdAt: "desc" },
        },
        createdBy: {
          select: { firstName: true, lastName: true },
        },
      },
    })

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 })
    }

    return NextResponse.json(patient)
  } catch (error) {
    console.error("[GET /api/patients/[id]]", error)
    return NextResponse.json({ error: "Failed to fetch patient" }, { status: 500 })
  }
}

// ── PUT /api/patients/[id] ────────────────────────────────────────────────────

const UPDATABLE_FIELDS = [
  "firstName", "lastName", "middleName", "dateOfBirth", "gender", "phone", "email",
  "address", "city", "state", "zipCode", "parentName", "parentRelation",
  "parentPhone", "parentEmail", "parent2Name", "parent2Relation", "parentPhone2",
  "parent2Email", "emergencyContact", "emergencyPhone",
  "insuranceProvider", "insuranceId", "insurancePlanType", "insurancePlan",
  "insuranceMemberId", "allergies", "medications",
  "medicalNotes", "preferredLanguage", "preferredProvider", "secondaryLanguage",
  "raceEthnicity", "membershipStatus", "status", "privateMode",
] as const

type UpdatableField = (typeof UPDATABLE_FIELDS)[number]

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const body = await req.json()

    // Build data object only from allowed fields that are present in the body
    const data: Prisma.PatientUpdateInput = {}

    for (const field of UPDATABLE_FIELDS) {
      if (!(field in body)) continue

      if (field === "dateOfBirth") {
        const parsed = new Date(body.dateOfBirth)
        if (isNaN(parsed.getTime())) {
          return NextResponse.json({ error: "Invalid dateOfBirth value" }, { status: 400 })
        }
        data.dateOfBirth = parsed
      } else if (field === "privateMode") {
        data.privateMode = body.privateMode === true || body.privateMode === "true"
      } else {
        // Safe cast — all other fields are string / enum values
        (data as Record<UpdatableField, unknown>)[field] = body[field]
      }
    }

    const patient = await prisma.patient.update({ where: { id }, data })

    return NextResponse.json(patient)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return NextResponse.json({ error: "Patient not found" }, { status: 404 })
      }
    }
    console.error("[PUT /api/patients/[id]]", error)
    return NextResponse.json({ error: "Failed to update patient" }, { status: 500 })
  }
}

// ── DELETE /api/patients/[id] ─────────────────────────────────────────────────
// Soft-delete only: sets status → ARCHIVED.
// HIPAA requires retention of patient records — hard deletes are not permitted.

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    await prisma.patient.update({
      where: { id },
      data: { status: "ARCHIVED" },
    })

    return NextResponse.json({ message: "Patient archived successfully" })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return NextResponse.json({ error: "Patient not found" }, { status: 404 })
      }
    }
    console.error("[DELETE /api/patients/[id]]", error)
    return NextResponse.json({ error: "Failed to archive patient" }, { status: 500 })
  }
}
