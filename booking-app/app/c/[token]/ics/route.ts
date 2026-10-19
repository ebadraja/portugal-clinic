import { NextRequest, NextResponse } from "next/server"
import { getClinicSettings } from "@/lib/clinic/settings"
import { findByToken } from "@/lib/appointments/patientLink"
import { appointmentLink } from "@/lib/appointments/notifications"
import { buildIcs } from "@/lib/appointments/messages"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ token: string }> }

// ── GET /c/[token]/ics — "add to calendar" file for Apple/Outlook/any calendar ──

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { token } = await params
  const appt = await findByToken(token)
  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const settings = await getClinicSettings()
  const ics = buildIcs(
    { appointmentId: appt.id, startTime: appt.startTime, endTime: appt.endTime, providerName: appt.provider, link: appointmentLink(appt.id), settings },
    new Date(),
    appt.status === "CANCELLED",
  )
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="consulta.ics"',
      "Cache-Control": "no-store",
    },
  })
}
