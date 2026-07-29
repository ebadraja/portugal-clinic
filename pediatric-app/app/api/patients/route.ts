import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import type { Prisma } from "@/lib/generated/prisma/client"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl

    const search = searchParams.get("search") ?? ""
    const status = searchParams.get("status") ?? "all"
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)))
    const sortBy = searchParams.get("sortBy") ?? "createdAt"
    const sortOrder = (searchParams.get("sortOrder") ?? "desc") as "asc" | "desc"

    const where: Prisma.PatientWhereInput = {}

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { parentName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ]
    }

    if (status && status !== "all") {
      where.status = status as Prisma.EnumPatientStatusFilter["equals"]
    } else {
      // Default "all" view excludes DRAFT-status patients (they clutter Active).
      // INACTIVE and ARCHIVED remain visible; pick DRAFT via the status filter.
      where.status = { not: "DRAFT" }
    }

    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: { select: { appointments: true } },
        },
      }),
      prisma.patient.count({ where }),
    ])

    return NextResponse.json({
      data: patients,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("[GET /api/patients]", error)
    return NextResponse.json({ error: "Failed to fetch patients" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { firstName, lastName, dateOfBirth, phone, parentName } = body

    if (!firstName || !lastName || !dateOfBirth || !phone || !parentName) {
      return NextResponse.json(
        { error: "Missing required fields: firstName, lastName, dateOfBirth, phone, parentName" },
        { status: 400 }
      )
    }

    const patient = await prisma.patient.create({
      data: {
        firstName,
        lastName,
        middleName: body.middleName,
        dateOfBirth: new Date(dateOfBirth),
        phone,
        parentName,
        parentRelation: body.parentRelation,
        parentPhone: body.parentPhone ?? phone,
        parentEmail: body.parentEmail,
        parent2Name: body.parent2Name,
        parent2Relation: body.parent2Relation,
        parentPhone2: body.parentPhone2,
        parent2Email: body.parent2Email,
        email: body.email,
        gender: body.gender,
        address: body.address,
        city: body.city,
        state: body.state,
        zipCode: body.zipCode,
        emergencyContact: body.emergencyContact,
        emergencyPhone: body.emergencyPhone,
        insuranceProvider: body.insuranceProvider,
        insuranceId: body.insuranceId,
        insurancePlanType: body.insurancePlanType,
        insurancePlan: body.insurancePlan,
        insuranceMemberId: body.insuranceMemberId,
        allergies: body.allergies,
        medications: body.medications,
        medicalNotes: body.medicalNotes,
        preferredLanguage: body.preferredLanguage ?? "English",
        preferredProvider: body.preferredProvider,
        secondaryLanguage: body.secondaryLanguage,
        raceEthnicity: body.raceEthnicity,
        membershipStatus: body.membershipStatus,
        privateMode: body.privateMode === true,
        status: "ACTIVE",
      },
    })

    return NextResponse.json(patient, { status: 201 })
  } catch (error) {
    console.error("[POST /api/patients]", error)
    return NextResponse.json({ error: "Failed to create patient" }, { status: 500 })
  }
}
