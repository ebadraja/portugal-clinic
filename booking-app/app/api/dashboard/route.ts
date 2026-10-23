import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/auth"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Today's date range (midnight to midnight)
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

    const yesterdayStart = new Date(todayStart)
    yesterdayStart.setDate(yesterdayStart.getDate() - 1)
    const yesterdayEnd = new Date(todayEnd)
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1)

    const weekStart = new Date(todayStart)
    weekStart.setDate(weekStart.getDate() - 7)

    const thirtyDaysAgo = new Date(todayStart)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [
      settings,
      callsToday,
      callsYesterday,
      todayAppointments,
      appointmentsBookedToday,
      appointmentsYesterday,
      activePatients,
      newPatientsThisWeek,
      noShowsLast30,
      totalAptsLast30,
      escalatedToday,
      avgDurationResult,
      recentCalls,
      openCallbacks,
    ] = await Promise.all([
      // Practice settings
      prisma.settings.findFirst({ select: { practiceName: true } }),

      // Calls today
      prisma.callLog.count({ where: { startTime: { gte: todayStart, lte: todayEnd } } }),

      // Calls yesterday
      prisma.callLog.count({ where: { startTime: { gte: yesterdayStart, lte: yesterdayEnd } } }),

      // Today's schedule (all appointments scheduled/confirmed for today)
      prisma.appointment.findMany({
        where: {
          startTime: { gte: todayStart, lte: todayEnd },
          status: { in: ["SCHEDULED", "CONFIRMED", "COMPLETED"] },
        },
        orderBy: { startTime: "asc" },
        take: 8,
        include: { patient: { select: { firstName: true, lastName: true } } },
      }),

      // Appointments booked today (created today, any status)
      prisma.appointment.count({
        where: { createdAt: { gte: todayStart, lte: todayEnd } },
      }),

      // Appointments created yesterday
      prisma.appointment.count({
        where: { createdAt: { gte: yesterdayStart, lte: yesterdayEnd } },
      }),

      // Total active patients
      prisma.patient.count({ where: { status: "ACTIVE" } }),

      // New patients this week
      prisma.patient.count({ where: { createdAt: { gte: weekStart } } }),

      // No-shows in last 30 days
      prisma.appointment.count({
        where: { status: "NO_SHOW", startTime: { gte: thirtyDaysAgo, lte: todayEnd } },
      }),

      // Total appointments in last 30 days (for no-show rate calc)
      prisma.appointment.count({
        where: { startTime: { gte: thirtyDaysAgo, lte: todayEnd } },
      }),

      // Escalated calls today
      prisma.callLog.count({
        where: { wasEscalated: true, startTime: { gte: todayStart, lte: todayEnd } },
      }),

      // Average call duration today
      prisma.callLog.aggregate({
        _avg: { duration: true },
        where: {
          duration: { not: null },
          startTime: { gte: todayStart, lte: todayEnd },
        },
      }),

      // Recent 5 calls
      prisma.callLog.findMany({
        orderBy: { startTime: "desc" },
        take: 5,
        select: {
          id: true,
          callerName: true,
          callerPhone: true,
          startTime: true,
          duration: true,
          outcome: true,
          wasEscalated: true,
          patient: { select: { firstName: true, lastName: true } },
        },
      }),

      // Callbacks the reception still has to make (same rule as the Callbacks badge)
      prisma.callbackRequest.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    ])

    const noShowRate =
      totalAptsLast30 > 0 ? parseFloat(((noShowsLast30 / totalAptsLast30) * 100).toFixed(1)) : 0

    const schedule = todayAppointments.map((a) => ({
      id: a.id,
      startTime: a.startTime.toISOString(),
      type: a.type as string,
      status: a.status as string,
      patient: a.patient,
    }))

    const avgDurationSecs = avgDurationResult._avg.duration ?? 0

    return NextResponse.json({
      practiceName: settings?.practiceName ?? "Clínica Dentária Nunes Monteiro",
      user: session?.user
        ? {
            firstName: session.user.firstName,
            lastName:  session.user.lastName,
            role:      session.user.role,
          }
        : null,
      stats: {
        callsToday,
        callsYesterday,
        appointmentsToday: todayAppointments.length,
        appointmentsBookedToday,
        appointmentsYesterday,
        activePatients,
        newPatientsThisWeek,
        noShowRate,
        avgCallDurationSeconds: Math.round(avgDurationSecs),
        escalatedToday,
        openCallbacks,
      },
      recentCalls,
      todaySchedule: schedule,
    })
  } catch (error) {
    console.error("[GET /api/dashboard]", error)
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 })
  }
}
