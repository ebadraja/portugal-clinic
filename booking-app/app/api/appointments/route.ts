import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@/lib/generated/prisma/client"
import prisma from "@/lib/prisma"
import { auth } from "@/auth"
import { requireStaff } from "@/lib/auth/guards"
import { createAppointment } from "@/lib/appointments/booking"
import { bookingFailureResponse, staffActor } from "@/lib/appointments/http"
import { getClinicSettings, providerByName } from "@/lib/clinic/settings"
import { utcToZoned } from "@/lib/clinic/time"

// ── GET /api/appointments ─────────────────────────────────────────────────────
// Filters: startDate, endDate, status, type, provider, patientId, page, limit
// Ordered by startTime ascending. Includes patient firstName, lastName, phone.

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
// Required: patientId, startTime, endTime, type; provider (name) or providerId.
// Goes through the booking service: dentist-aware overlap check under the day lock (409),
// reminders planned. This legacy route keeps its old behaviour of accepting times outside
// opening hours (acknowledgeWarnings defaults to true); the agenda asks the user instead.

export async function POST(request: NextRequest) {
  try {
    const guard = await requireStaff({ write: true })
    if (!guard.ok) return guard.response
    const body = await request.json()

    const { patientId, startTime, endTime, type } = body
    if (!patientId || !startTime || !endTime || !type) {
      return NextResponse.json(
        { error: "Missing required fields: patientId, startTime, endTime, type" },
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

    const settings = await getClinicSettings()
    // The legacy dialog still lists demo names; an unknown name means "first available dentist".
    const providerId = body.providerId ?? providerByName(body.provider, settings.providers)?.id ?? null
    const z = utcToZoned(start, settings.timezone)

    const result = await createAppointment(
      {
        patientId,
        date: z.date,
        time: z.time,
        type,
        durationMinutes: Math.round((end.getTime() - start.getTime()) / 60_000),
        providerId,
        reason: body.reason ?? null,
        notes: body.notes ?? null,
        status: body.status ?? "SCHEDULED",
        bookedVia: body.bookedVia ?? "STAFF",
        allowOverlap: body.allowOverlap === true,
        acknowledgeWarnings: body.acknowledgeWarnings ?? true,
        notifyPatient: body.notifyPatient !== false,
      },
      staffActor(guard.user),
      { settings },
    )
    if (!result.ok) return bookingFailureResponse(result)

    const appointment = await prisma.appointment.findUnique({
      where: { id: result.appointment.id },
      include: { patient: { select: { firstName: true, lastName: true, phone: true } } },
    })
    return NextResponse.json({ ...appointment, warnings: result.warnings }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/appointments]", error)
    return NextResponse.json({ error: "Failed to create appointment" }, { status: 500 })
  }
}
