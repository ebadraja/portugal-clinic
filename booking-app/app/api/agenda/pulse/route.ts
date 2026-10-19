import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireStaff } from "@/lib/auth/guards"
import { getClinicSettings } from "@/lib/clinic/settings"
import { wallClock } from "@/lib/appointments/agenda"

export const dynamic = "force-dynamic"

// ── GET /api/agenda/pulse?since=ISO — cheap poll: did anything change? ────────
// The latest change time, plus bookings/changes made by Acácia or by patients since `since`,
// so the agenda can refresh and say "Nova marcação pelo assistente".

export async function GET(request: NextRequest) {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const sinceRaw = request.nextUrl.searchParams.get("since")
  const since = sinceRaw ? new Date(sinceRaw) : null
  if (!since || isNaN(since.getTime())) return NextResponse.json({ error: "since must be an ISO date" }, { status: 400 })
  try {
    const [latestAppt, latestBlock, external] = await Promise.all([
      prisma.appointment.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
      prisma.calendarBlock.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
      prisma.appointmentEvent.findMany({
        where: { createdAt: { gt: since }, actor: { in: ["VOICE_AGENT", "PATIENT"] } },
        orderBy: { createdAt: "asc" },
        take: 20,
        select: {
          kind: true,
          actor: true,
          appointment: { select: { id: true, startTime: true, patient: { select: { firstName: true, lastName: true } } } },
        },
      }),
    ])
    const latest = [latestAppt?.updatedAt, latestBlock?.updatedAt]
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0]
    const tz = (await getClinicSettings()).timezone
    return NextResponse.json({
      changed: !!latest && latest > since,
      latest: latest?.toISOString() ?? null,
      events: external.map((e) => ({
        kind: e.kind,
        actor: e.actor,
        appointmentId: e.appointment.id,
        start: wallClock(e.appointment.startTime, tz),
        patientName: `${e.appointment.patient.firstName} ${e.appointment.patient.lastName.charAt(0)}.`,
      })),
    })
  } catch (error) {
    console.error("[GET /api/agenda/pulse]", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
