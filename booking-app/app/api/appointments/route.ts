import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@/lib/generated/prisma/client"
import prisma from "@/lib/prisma"
import { auth } from "@/auth"

// ── GET /api/appointments ─────────────────────────────────────────────────────
// Filters: startDate, endDate, status, type, provider, patientId, page, limit
// Ordered by startTime ascending. Includes patient firstName, lastName, phone.

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    const { searchParams } = request.nextUrl

    const page  = Math.max(1, parseInt(searchParams.get("page")  ?? "1",  10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)))

    const startDate = searchParams.get("startDate")
    const endDate   = searchParams.get("endDate")
    const status    = searchParams.get("status")
    const type      = searchParams.get("type")
    const provider  = searchParams.get("provider")
    const patientId = searchParams.get("patientId")

    const where: Prisma.AppointmentWhereInput = {}

    if (startDate || endDate) {
      where.startTime = {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate   && { lte: new Date(endDate) }),
      }
    }

    if (status)    where.status   = status   as Prisma.EnumAppointmentStatusFilter["equals"]
    if (type)      where.type     = type     as Prisma.EnumAppointmentTypeFilter["equals"]
    if (provider)  where.provider = { contains: provider, mode: "insensitive" }
    if (patientId) where.patientId = patientId

    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { startTime: "asc" },
        include: {
          patient: {
            select: { firstName: true, lastName: true, phone: true },
          },
        },
      }),
      prisma.appointment.count({ where }),
    ])

    // HIPAA: log list access (fire-and-forget — never blocks the response)
    prisma.auditLog.create({
      data: {
        userId:    session?.user?.id ?? null,
        action:    "READ",
        entity:    "appointment",
        timestamp: new Date(),
      },
    }).catch(() => {})

    return NextResponse.json({
      data: appointments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("[GET /api/appointments]", error)
    return NextResponse.json({ error: "Failed to fetch appointments" }, { status: 500 })
  }
}

// ── POST /api/appointments ────────────────────────────────────────────────────
// Required: patientId, startTime, endTime, type, provider
// Validates: endTime > startTime, no overlapping provider slots

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    const body = await request.json()

    const { patientId, startTime, endTime, type, provider } = body

    if (!patientId || !startTime || !endTime || !type || !provider) {
      return NextResponse.json(
        { error: "Missing required fields: patientId, startTime, endTime, type, provider" },
        { status: 400 }
      )
    }

    const start = new Date(startTime)
    const end   = new Date(endTime)

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid startTime or endTime" }, { status: 400 })
    }

    if (end <= start) {
      return NextResponse.json({ error: "endTime must be after startTime" }, { status: 400 })
    }

    // Overlap check: same provider, non-cancelled/no-show, time ranges intersect
    const overlap = await prisma.appointment.findFirst({
      where: {
        provider,
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
        AND: [
          { startTime: { lt: end } },
          { endTime:   { gt: start } },
        ],
      },
      select: { id: true, startTime: true, endTime: true },
    })

    if (overlap) {
      return NextResponse.json(
        {
          error: "Provider already has an appointment during this time",
          conflict: {
            appointmentId: overlap.id,
            startTime: overlap.startTime,
            endTime:   overlap.endTime,
          },
        },
        { status: 409 }
      )
    }

    const duration  = Math.round((end.getTime() - start.getTime()) / 60_000) // minutes
    const reqStatus = body.status ?? "SCHEDULED"

    const appointment = await prisma.appointment.create({
      data: {
        patientId,
        startTime:  start,
        endTime:    end,
        duration,
        type,
        status:     reqStatus,
        provider,
        reason:     body.reason   ?? null,
        notes:      body.notes    ?? null,
        bookedVia:  body.bookedVia ?? "STAFF",
        createdById: session?.user?.id ?? null,
      },
      include: {
        patient: {
          select: { firstName: true, lastName: true, phone: true },
        },
      },
    })

    // If appointment is immediately COMPLETED, update patient visit stats
    if (reqStatus === "COMPLETED") {
      await prisma.patient.update({
        where: { id: patientId },
        data: {
          totalVisits: { increment: 1 },
          lastVisitAt: start,
        },
      })
    }

    // HIPAA audit log
    await prisma.auditLog.create({
      data: {
        userId:    session?.user?.id ?? null,
        action:    "CREATE",
        entity:    "appointment",
        entityId:  appointment.id,
        timestamp: new Date(),
      },
    })

    return NextResponse.json(appointment, { status: 201 })
  } catch (error) {
    console.error("[POST /api/appointments]", error)
    return NextResponse.json({ error: "Failed to create appointment" }, { status: 500 })
  }
}
