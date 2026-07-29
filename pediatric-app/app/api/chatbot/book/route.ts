import { NextRequest } from "next/server"
import type { AppointmentType } from "@/lib/generated/prisma/client"
import { getDayAvailability } from "@/lib/appointments/availability"
import {
  chatbotJsonResponse,
  handleChatbotPreflight,
  rejectChatbotOrigin,
} from "@/lib/chatbot/cors"
import { isRateLimited } from "@/lib/chatbot/rateLimit"
import prisma from "@/lib/prisma"
import { normalizePhone, phonesMatch } from "@/lib/messaging/portalAuth"

export const dynamic = "force-dynamic"

const BOOKING_WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_BOOKINGS_PER_PHONE = 5
const DEFAULT_DURATION = 30

const APPOINTMENT_TYPES = new Set<string>([
  "WELL_CHILD_VISIT",
  "SICK_VISIT",
  "VACCINATION",
  "FOLLOW_UP",
  "CONSULTATION",
  "PROCEDURE",
  "OTHER",
])

const PROVIDER_BY_ID: Record<string, string> = {
  "dr-tamas":      "Dr. Jonathan Tamas",
  "dr-richards":   "Dr. Peaches Richards",
  "no-preference": "Dr. Jonathan Tamas",
}

function getInternalBaseUrl(request: NextRequest): string {
  const env = process.env.NEXTAUTH_URL
  if (env) return env.replace(/\/$/, "")
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  const proto = request.headers.get("x-forwarded-proto") ?? "http"
  if (host) return `${proto}://${host}`
  return "http://localhost:3000"
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function splitChildName(childName: string): { firstName: string; lastName: string } {
  const parts = childName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: "", lastName: "" }
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
}

function resolveProvider(providerId: string): string | null {
  if (PROVIDER_BY_ID[providerId]) return PROVIDER_BY_ID[providerId]
  if (Object.values(PROVIDER_BY_ID).includes(providerId)) return providerId
  return null
}

function availabilityProviderFilter(providerId: string, resolvedProvider: string): string | undefined {
  if (providerId === "no-preference") return undefined
  return resolvedProvider
}

async function findOrCreatePatient(input: {
  childName: string
  childDob: string
  parentName: string
  parentPhone: string
  parentEmail?: string
  isNewPatient: boolean
  preferredProvider: string
}) {
  const { firstName, lastName } = splitChildName(input.childName)
  const dob = new Date(input.childDob)

  if (!firstName || !lastName || isNaN(dob.getTime())) {
    throw new Error("Invalid patient details")
  }

  const candidates = await prisma.patient.findMany({
    where: {
      firstName: { contains: firstName, mode: "insensitive" },
      lastName:  { contains: lastName, mode: "insensitive" },
    },
    take: 20,
  })

  const match = candidates.find((p) =>
    sameCalendarDay(p.dateOfBirth, dob) &&
    (phonesMatch(p.parentPhone ?? "", input.parentPhone) || phonesMatch(p.phone ?? "", input.parentPhone))
  )

  if (match) return match

  if (!input.isNewPatient) {
    return null
  }

  return prisma.patient.create({
    data: {
      firstName,
      lastName,
      dateOfBirth: dob,
      phone: input.parentPhone,
      parentName: input.parentName,
      parentPhone: input.parentPhone,
      parentEmail: input.parentEmail ?? null,
      email: input.parentEmail ?? null,
      preferredProvider: input.preferredProvider,
      preferredLanguage: "English",
      status: "ACTIVE",
    },
  })
}

async function notifyAdminsBooked(params: {
  patientId: string
  patientName: string
  appointmentType: string
  dateDisplay: string
  timeDisplay: string
}) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  })

  await prisma.$transaction(
    admins.map((admin) =>
      prisma.notification.create({
        data: {
          userId:    admin.id,
          type:      "appointment_booked",
          title:     "GIGI Chatbot Booked Appointment",
          message:   `GIGI chatbot booked a ${params.appointmentType} for ${params.patientName} on ${params.dateDisplay} at ${params.timeDisplay}.`,
          icon:      "check",
          actionUrl: `/patients/${params.patientId}`,
        },
      })
    )
  )
}

function to12Hour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number)
  const suffix = h >= 12 ? "pm" : "am"
  const hour   = h % 12 || 12
  return `${hour}:${String(m).padStart(2, "0")}${suffix}`
}

export async function OPTIONS(request: NextRequest) {
  return handleChatbotPreflight(request) ?? chatbotJsonResponse({}, request.headers.get("origin"), { status: 204 })
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  const preflight = handleChatbotPreflight(request)
  if (preflight) return preflight

  const originReject = rejectChatbotOrigin(origin)
  if (originReject) return originReject

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return chatbotJsonResponse({ error: "Invalid JSON" }, origin, { status: 400 })
  }

  if (body.honeypot && String(body.honeypot).trim()) {
    return chatbotJsonResponse({ error: "Unable to process booking." }, origin, { status: 400 })
  }

  const appointmentType = String(body.appointmentType ?? "").trim()
  const providerId      = String(body.providerId ?? "").trim()
  const date            = String(body.date ?? "").trim()
  const time            = String(body.time ?? "").trim()
  const childName       = String(body.childName ?? "").trim()
  const childDob        = String(body.childDob ?? "").trim()
  const parentName      = String(body.parentName ?? "").trim()
  const parentPhone     = String(body.parentPhone ?? "").trim()
  const parentEmail     = body.parentEmail ? String(body.parentEmail).trim() : undefined
  const isNewPatient    = Boolean(body.isNewPatient)
  const sessionId       = String(body.sessionId ?? "").trim()

  if (!APPOINTMENT_TYPES.has(appointmentType)) {
    return chatbotJsonResponse({ error: "Invalid appointment type." }, origin, { status: 400 })
  }

  const provider = resolveProvider(providerId)
  if (!provider) {
    return chatbotJsonResponse({ error: "Invalid provider." }, origin, { status: 400 })
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return chatbotJsonResponse({ error: "Invalid date." }, origin, { status: 400 })
  }
  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    return chatbotJsonResponse({ error: "Invalid time." }, origin, { status: 400 })
  }
  if (!childName || !childDob || !parentName || !parentPhone) {
    return chatbotJsonResponse({ error: "Missing required booking fields." }, origin, { status: 400 })
  }

  const phoneKey = normalizePhone(parentPhone)
  if (!phoneKey || phoneKey.length < 10) {
    return chatbotJsonResponse({ error: "Invalid parent phone number." }, origin, { status: 400 })
  }

  if (isRateLimited(`chatbot:book:phone:${phoneKey}`, MAX_BOOKINGS_PER_PHONE, BOOKING_WINDOW_MS)) {
    return chatbotJsonResponse(
      { error: "Too many booking attempts for this phone number today. Please call us at (253) 400-4479." },
      origin,
      { status: 429 }
    )
  }

  if (sessionId && isRateLimited(`chatbot:book:session:${sessionId}`, MAX_BOOKINGS_PER_PHONE, BOOKING_WINDOW_MS)) {
    return chatbotJsonResponse(
      { error: "Too many booking attempts. Please call us at (253) 400-4479." },
      origin,
      { status: 429 }
    )
  }

  try {
    const providerFilter = availabilityProviderFilter(providerId, provider)
    const availability = await getDayAvailability({
      date,
      provider: providerFilter,
      duration: DEFAULT_DURATION,
    })

    const slotAvailable = availability.availableSlots.some((s) => s.startTime === time)
    if (!slotAvailable) {
      return chatbotJsonResponse(
        { error: "That time slot is no longer available. Please choose another time." },
        origin,
        { status: 409 }
      )
    }

    const patient = await findOrCreatePatient({
      childName,
      childDob,
      parentName,
      parentPhone,
      parentEmail,
      isNewPatient,
      preferredProvider: provider,
    })

    if (!patient) {
      return chatbotJsonResponse(
        { error: "We couldn't find a matching patient record. Please check the new patient box or call us to register." },
        origin,
        { status: 404 }
      )
    }

    const start = new Date(`${date}T${time}:00`)
    const end   = new Date(start.getTime() + DEFAULT_DURATION * 60_000)

    if (isNaN(start.getTime())) {
      return chatbotJsonResponse({ error: "Invalid date/time combination." }, origin, { status: 400 })
    }

    const baseUrl = getInternalBaseUrl(request)
    const apptRes = await fetch(`${baseUrl}/api/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: patient.id,
        startTime: start.toISOString(),
        endTime:   end.toISOString(),
        type:      appointmentType as AppointmentType,
        provider,
        reason:    appointmentType.replace(/_/g, " ").toLowerCase(),
        notes:     "Booked via GIGI website chatbot",
        bookedVia: "CHATBOT",
      }),
    })

    const apptData = await apptRes.json().catch(() => ({}))

    if (!apptRes.ok) {
      const msg = typeof apptData.error === "string"
        ? apptData.error
        : "Failed to create appointment."
      return chatbotJsonResponse({ error: msg }, origin, { status: apptRes.status })
    }

    const dateDisplay = start.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
    const timeDisplay = to12Hour(time)
    const patientName = `${patient.firstName} ${patient.lastName}`

    notifyAdminsBooked({
      patientId: patient.id,
      patientName,
      appointmentType: appointmentType.replace(/_/g, " ").toLowerCase(),
      dateDisplay,
      timeDisplay,
    }).catch((err) => console.error("[POST /api/chatbot/book] notification failed:", err))

    return chatbotJsonResponse(
      {
        success: true,
        appointmentId: apptData.id,
        confirmation: {
          patientName,
          appointmentType,
          provider,
          date,
          time: timeDisplay,
          dateLabel: dateDisplay,
        },
      },
      origin,
      { status: 201 }
    )
  } catch (error) {
    console.error("[POST /api/chatbot/book]", error)
    return chatbotJsonResponse({ error: "Failed to complete booking." }, origin, { status: 500 })
  }
}
