import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireStaff } from "@/lib/auth/guards"
import { getClinicSettings, providerByName } from "@/lib/clinic/settings"
import { clinicalAlerts } from "@/lib/patients/alerts"
import { wallClock } from "@/lib/appointments/agenda"
import { listWaitlist } from "@/lib/appointments/waitlist"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

// ── GET /api/agenda/patients/[id] ─────────────────────────────────────────────
// What the desk needs to see while booking: alerts, last visit, what is already booked,
// no-shows, the latest notes and whether the patient is on the waiting list.

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const { id } = await params
  try {
    const settings = await getClinicSettings()
    const p = await prisma.patient.findUnique({
      where: { id },
      select: {
        id: true, firstName: true, lastName: true, phone: true, phone2: true, phoneNote: true, email: true, dateOfBirth: true,
        allergies: true, medicalNotes: true, tags: true, totalVisits: true, lastVisitAt: true, preferredProvider: true,
        appointments: {
          where: { startTime: { gt: new Date() }, status: { in: ["SCHEDULED", "CONFIRMED"] } },
          orderBy: { startTime: "asc" },
          take: 5,
          select: { id: true, startTime: true, type: true, provider: true, status: true },
        },
        notes: { orderBy: { createdAt: "desc" }, take: 3, select: { id: true, content: true, noteType: true, createdAt: true } },
        _count: { select: { appointments: { where: { status: "NO_SHOW" } } } },
      },
    })
    if (!p) return NextResponse.json({ error: "Patient not found" }, { status: 404 })
    const waitlist = (await listWaitlist(settings, { patientId: id }))[0] ?? null
    return NextResponse.json({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`.trim(),
      phone: p.phone ?? p.phone2,
      phoneNote: p.phoneNote,
      email: p.email,
      dateOfBirth: p.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      alerts: clinicalAlerts(p),
      tags: p.tags,
      totalVisits: p.totalVisits,
      lastVisitAt: p.lastVisitAt?.toISOString() ?? null,
      noShows: p._count.appointments,
      preferredProviderId: providerByName(p.preferredProvider, settings.providers)?.id ?? null,
      upcoming: p.appointments.map((a) => ({ id: a.id, start: wallClock(a.startTime, settings.timezone), type: a.type, provider: a.provider, status: a.status })),
      notes: p.notes.map((n) => ({ id: n.id, content: n.content, noteType: n.noteType, createdAt: n.createdAt.toISOString() })),
      waitlist,
    })
  } catch (error) {
    console.error("[GET /api/agenda/patients/[id]]", error)
    return NextResponse.json({ error: "Failed to load the patient" }, { status: 500 })
  }
}
