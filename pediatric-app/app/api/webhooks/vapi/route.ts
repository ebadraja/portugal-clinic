import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { APPLE_HEALTH_PLANS } from "@/lib/insurance-plans"
import { appendSystemMessage } from "@/lib/messaging/systemMessages"

export const dynamic = "force-dynamic"

// ─── Vapi payload types ────────────────────────────────────────────────────────

interface VapiCustomer {
  name?: string
  number?: string
  email?: string
}

interface VapiCall {
  id: string
  type?: "webCall" | "inboundPhoneCall" | "outboundPhoneCall"
  customer?: VapiCustomer
  startedAt?: string
  endedAt?: string
  metadata?: Record<string, unknown>
}

interface VapiMessage {
  role: "user" | "assistant" | "system" | "bot" | "tool"
  content?: string
  message?: string
  time?: number
  secondsFromStart?: number
}

interface VapiArtifact {
  messages?: VapiMessage[]
  transcript?: string
  recordingUrl?: string
  stereoRecordingUrl?: string
}

interface VapiStructuredData {
  callerName?: string
  patientName?: string
  patientDOB?: string
  isNewPatient?: boolean
  callIntent?: string
  appointmentType?: string
  appointmentConfirmed?: boolean
  requestedDate?: string
  requestedTime?: string
  wasEscalated?: boolean
  insuranceProvider?: string
}

interface VapiAnalysis {
  summary?: string
  structuredData?: VapiStructuredData
  successEvaluation?: string
}

interface VapiEndOfCallReport {
  type: "end-of-call-report"
  call: VapiCall
  transcript?: string
  summary?: string
  messages?: VapiMessage[]
  recordingUrl?: string
  endedReason?: string
  artifact?: VapiArtifact
  analysis?: VapiAnalysis
}

interface VapiWebhookBody {
  message: VapiEndOfCallReport | { type: string }
}

// ─── ChatLog inference helpers (unchanged) ────────────────────────────────────

function inferTopic(text: string): "APPOINTMENT" | "PRICING" | "INSURANCE" | "HOURS" | "SERVICES" | "LOCATION" | "OTHER" {
  const t = text.toLowerCase()
  if (/\b(appointment|schedule|book|reschedule|cancel|visit|checkup|check-up|well.child)\b/.test(t)) return "APPOINTMENT"
  if (/\b(insurance|coverage|copay|co-pay|deductible|medicaid|medicare|tricare|billing|claim)\b/.test(t)) return "INSURANCE"
  if (/\b(price|cost|fee|charge|payment|pay|rate|afford)\b/.test(t)) return "PRICING"
  if (/\b(hours|open|close|closing|available|when|weekend|saturday|sunday)\b/.test(t)) return "HOURS"
  if (/\b(location|address|direction|where|map|park|find you|nearest)\b/.test(t)) return "LOCATION"
  if (/\b(service|treatment|doctor|physician|specialist|vaccine|immunization|sick|wellness|pediatric|developmental)\b/.test(t)) return "SERVICES"
  return "OTHER"
}

type ChatOutcomeType = "IN_PROGRESS" | "BOOKED" | "INFO_PROVIDED" | "ESCALATED_TO_CALL" | "LEAD_CAPTURED" | "ABANDONED"

function inferChatOutcome(summary: string, transcript: string, endedReason?: string, messageCount?: number): ChatOutcomeType {
  const combined = `${summary} ${transcript}`.toLowerCase()
  if (/\b(booked|scheduled|confirmed|appointment.*set|set.*appointment)\b/.test(combined)) return "BOOKED"
  if (/\b(transfer|escalat|speak with someone|connect you|human agent|call you back|nurse)\b/.test(combined)) return "ESCALATED_TO_CALL"
  if (/\b(email.*sent|confirmation.*sent|follow.up|we.ll.*contact|reach out)\b/.test(combined) ||
      /\b(name.*phone|contact.*info|left.*details)\b/.test(combined)) return "LEAD_CAPTURED"
  if (
    endedReason === "silence-timed-out" ||
    endedReason === "voicemail" ||
    (messageCount !== undefined && messageCount <= 2)
  ) return "ABANDONED"
  return "INFO_PROVIDED"
}

// ─── CallLog inference helpers ────────────────────────────────────────────────

type CallIntentType = "APPOINTMENT_BOOKING" | "INQUIRY" | "COMPLAINT" | "SUPPORT" | "ROUTING" | "CANCELLATION" | "VERIFICATION" | "EMERGENCY" | "GENERAL"
type CallOutcomeType = "IN_PROGRESS" | "BOOKED" | "INFO_PROVIDED" | "TRANSFERRED" | "HUNG_UP" | "VOICEMAIL"
type SentimentType   = "POSITIVE" | "NEUTRAL" | "NEGATIVE"

function inferCallIntent(text: string): CallIntentType {
  const t = text.toLowerCase()
  if (/\b(emergency|urgent|911|severe|critical|life.threatening|allergic)\b/.test(t)) return "EMERGENCY"
  if (/\b(cancel|cancellation)\b/.test(t)) return "CANCELLATION"
  if (/\b(appointment|schedule|book|reschedule|visit|checkup|well.child)\b/.test(t)) return "APPOINTMENT_BOOKING"
  if (/\b(complaint|complain|unhappy|dissatisfied|wrong|mistake|error|terrible)\b/.test(t)) return "COMPLAINT"
  if (/\b(transfer|route|connect|speak with|human|operator|nurse|staff)\b/.test(t)) return "ROUTING"
  if (/\b(verify|confirm|check|look up|look me up|records)\b/.test(t)) return "VERIFICATION"
  if (/\b(support|help|assist|problem|issue|trouble|not working)\b/.test(t)) return "SUPPORT"
  if (/\b(insurance|coverage|cost|price|fee|billing|hours|location|services|doctor|provider)\b/.test(t)) return "INQUIRY"
  return "GENERAL"
}

function inferCallOutcome(summary: string, transcript: string, endedReason?: string, messageCount?: number): CallOutcomeType {
  const combined = `${summary} ${transcript}`.toLowerCase()
  if (/\b(booked|scheduled|confirmed|appointment.*set|set.*appointment)\b/.test(combined)) return "BOOKED"
  if (/\b(transfer|escalat|speak with someone|connect you|human agent|nurse)\b/.test(combined)) return "TRANSFERRED"
  if (endedReason === "voicemail") return "VOICEMAIL"
  if (endedReason === "silence-timed-out" || (messageCount !== undefined && messageCount <= 2)) return "HUNG_UP"
  return "INFO_PROVIDED"
}

function inferSentiment(transcript: string): SentimentType {
  const t = transcript.toLowerCase()
  if (/\b(thank you|great|perfect|wonderful|excellent|love|awesome|appreciate|happy|pleased|fantastic)\b/.test(t)) return "POSITIVE"
  if (/\b(frustrat|upset|annoyed|terrible|awful|horrible|angry|rude|waste|worst|never again|ridiculous)\b/.test(t)) return "NEGATIVE"
  return "NEUTRAL"
}

// ─── Phone normalizer ─────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1")
}

// ─── Message mapper ────────────────────────────────────────────────────────────

interface MappedMessage {
  type: "bot" | "visitor"
  content: string
  timestamp: string
  senderName?: string
}

function mapMessages(vapiMessages: VapiMessage[]): MappedMessage[] {
  return vapiMessages
    .filter(m => m.role !== "system" && m.role !== "tool" && (m.content || m.message))
    .map(m => ({
      type: (m.role === "assistant" || m.role === "bot" ? "bot" : "visitor") as "bot" | "visitor",
      content: (m.content ?? m.message ?? "").trim(),
      timestamp: m.time ? new Date(m.time).toISOString() : new Date().toISOString(),
    }))
    .filter(m => m.content.length > 0)
}

// ─── Name extractor ───────────────────────────────────────────────────────────

function extractNameFromTranscript(transcript: string): string | null {
  if (!transcript) return null

  // "my name is John" / "my name's John Smith"
  const selfIntro = transcript.match(/\bmy name(?:'s| is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i)
  if (selfIntro) return selfIntro[1].trim()

  // "I'm John" / "I am Sarah"
  const iAm = transcript.match(/\bI(?:'m| am)\s+([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?)\b/i)
  if (iAm) {
    const name = iAm[1].trim()
    // Exclude common false positives
    if (!/^(calling|here|good|fine|okay|not|looking|trying|wondering)/i.test(name)) return name
  }

  // AI confirmation: "Thank you, John" / "Got it, Sarah" / "Great, Michael"
  const aiConfirm = transcript.match(/\b(?:Thank you|Got it|Great|Perfect|Wonderful|Of course),\s+([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?)[.!,]/i)
  if (aiConfirm) return aiConfirm[1].trim()

  // AI reads name back: "Is that E-b-a-d? ... Ebad" — grab the word after the question
  const spelled = transcript.match(/Is that\s+[A-Z](?:\s*[-–]\s*[A-Za-z])+\?[^.]*?(\b[A-Z][a-z]{2,}\b)/i)
  if (spelled) return spelled[1].trim()

  return null
}

// ─── Insurance plan keyword map ───────────────────────────────────────────────

const PLAN_KEYWORDS: { keywords: string[]; plan: string; planType: "Commercial" | "Apple Health" }[] = [
  { keywords: ["aetna"],                                        plan: "Aetna",                      planType: "Commercial"   },
  { keywords: ["ambetter"],                                     plan: "Ambetter",                   planType: "Commercial"   },
  { keywords: ["asuris"],                                       plan: "Asuris Northwest",           planType: "Commercial"   },
  { keywords: ["premera"],                                      plan: "Premera Blue Cross",         planType: "Commercial"   },
  { keywords: ["blue cross blue shield", "bcbs", "blue cross"], plan: "Blue Cross Blue Shield FEP", planType: "Commercial"   },
  { keywords: ["cigna"],                                        plan: "Cigna",                      planType: "Commercial"   },
  { keywords: ["first health"],                                 plan: "First Health Network",       planType: "Commercial"   },
  { keywords: ["first choice"],                                 plan: "First Choice Health Network",planType: "Commercial"   },
  { keywords: ["lifewise"],                                     plan: "LifeWise",                   planType: "Commercial"   },
  { keywords: ["regence", "blue shield"],                       plan: "Regence Blue Shield",        planType: "Commercial"   },
  { keywords: ["tricare", "triwest", "tri care", "tri west"],   plan: "Tricare/TriWest",            planType: "Commercial"   },
  { keywords: ["united healthcare", "united health", "uhc"],    plan: "United Healthcare",          planType: "Commercial"   },
  { keywords: ["coordinated care"],                             plan: "Coordinated Care",           planType: "Apple Health" },
  { keywords: ["molina"],                                       plan: "Molina",                     planType: "Apple Health" },
  { keywords: ["wellpoint"],                                    plan: "Wellpoint",                  planType: "Apple Health" },
]

// ─── Shared tool helpers ──────────────────────────────────────────────────────

function to12Hour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number)
  const suffix = h >= 12 ? "pm" : "am"
  const hour   = h % 12 || 12
  return `${hour}:${String(m).padStart(2, "0")}${suffix}`
}

type AppointmentTypeStr =
  | "WELL_CHILD_VISIT" | "SICK_VISIT" | "VACCINATION"
  | "FOLLOW_UP" | "CONSULTATION" | "PROCEDURE" | "OTHER"

function mapVisitType(raw: string): AppointmentTypeStr {
  const t = raw.toLowerCase()
  if (/well.child|wellness|checkup|annual|physical/.test(t)) return "WELL_CHILD_VISIT"
  if (/sick|illness|cold|fever/.test(t))                     return "SICK_VISIT"
  if (/vacc|immun/.test(t))                                  return "VACCINATION"
  if (/follow/.test(t))                                      return "FOLLOW_UP"
  if (/consult/.test(t))                                     return "CONSULTATION"
  if (/procedure/.test(t))                                   return "PROCEDURE"
  return "OTHER"
}

async function getAvailableSlots(
  dateParam: string,
  duration = 30
): Promise<{ startTime: string; endTime: string }[]> {
  const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
  const [year, month, day] = dateParam.split("-").map(Number)
  const dayStart  = new Date(year, month - 1, day,  0,  0,  0,   0)
  const dayEnd    = new Date(year, month - 1, day, 23, 59, 59, 999)
  const dayOfWeek = DAY_NAMES[dayStart.getDay()]

  type BHEntry = { day: string; open: string; close: string; enabled: boolean }
  type LB      = { start: string; end: string; enabled: boolean }

  const [settings, booked] = await Promise.all([
    prisma.settings.findFirst({ select: { businessHours: true, lunchBreak: true } }),
    prisma.appointment.findMany({
      where:  { startTime: { gte: dayStart, lte: dayEnd }, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
      select: { startTime: true, endTime: true },
    }),
  ])

  const hours = (settings?.businessHours as BHEntry[] | null)
    ?.find(h => h.day.toLowerCase() === dayOfWeek.toLowerCase())
  if (!hours?.enabled) return []

  const toMin  = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m }
  const toHHMM = (n: number) =>
    `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`

  const openMin    = toMin(hours.open)
  const closeMin   = toMin(hours.close)
  const rawLunch   = settings?.lunchBreak as LB | null
  const lunch      = rawLunch ?? { start: "12:30", end: "13:00", enabled: true }
  const lunchStart = lunch.enabled ? toMin(lunch.start) : -1
  const lunchEnd   = lunch.enabled ? toMin(lunch.end)   : -1

  const now     = new Date()
  const isToday = now.getFullYear() === year && now.getMonth() === month - 1 && now.getDate() === day
  const nowMin  = isToday ? now.getHours() * 60 + now.getMinutes() : -1

  const slots: { startTime: string; endTime: string }[] = []
  for (let s = openMin; s + duration <= closeMin; s += duration) {
    const e = s + duration
    if (isToday && s <= nowMin) continue
    if (lunch.enabled && s < lunchEnd && e > lunchStart) continue
    const sDate = new Date(year, month - 1, day, Math.floor(s / 60), s % 60)
    const eDate = new Date(year, month - 1, day, Math.floor(e / 60), e % 60)
    if (booked.some(a => a.startTime < eDate && a.endTime > sDate)) continue
    slots.push({ startTime: toHHMM(s), endTime: toHHMM(e) })
  }
  return slots
}

// ─── Tool: lookup_patient ─────────────────────────────────────────────────────

async function toolLookupPatient(args: Record<string, unknown>): Promise<string> {
  const childName = String(args.child_name ?? "").trim()
  if (!childName) return "Please provide the child's name."

  const parts     = childName.split(/\s+/)
  const firstName = parts[0]
  const lastName  = parts.length > 1 ? parts.slice(1).join(" ") : undefined

  const patients = await prisma.patient.findMany({
    where:   lastName
      ? { firstName: { contains: firstName, mode: "insensitive" }, lastName: { contains: lastName, mode: "insensitive" } }
      : { firstName: { contains: firstName, mode: "insensitive" } },
    take:    5,
    orderBy: { lastName: "asc" },
  })

  if (!patients.length) return "No patient found matching that name. They may be a new patient."

  let match = patients[0]
  if (args.date_of_birth && patients.length > 1) {
    const dobTarget = new Date(String(args.date_of_birth))
    const byDob = patients.find(p => Math.abs(p.dateOfBirth.getTime() - dobTarget.getTime()) < 86_400_000)
    if (byDob) match = byDob
  }

  const name      = `${match.firstName} ${match.lastName}`
  const dob       = match.dateOfBirth.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
  const insurance = match.insurancePlan ?? match.insuranceProvider ?? "not on file"
  const lastVisit = match.lastVisitAt
    ? match.lastVisitAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "no prior visits on record"

  return `Found: ${name}, DOB: ${dob}, Insurance: ${insurance}. Last visit: ${lastVisit}.`
}

// ─── Tool: check_availability ─────────────────────────────────────────────────

async function toolCheckAvailability(args: Record<string, unknown>): Promise<string> {
  const date = String(args.date ?? "").trim()
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Please provide a date in YYYY-MM-DD format."

  const duration  = typeof args.duration === "number" ? args.duration : 30
  const slots     = await getAvailableSlots(date, duration)
  const dateLabel = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })

  if (slots.length > 0) {
    const shown = slots.slice(0, 3).map(s => to12Hour(s.startTime)).join(", ")
    return `Available on ${dateLabel(date)}: ${shown}.`
  }

  for (let i = 1; i <= 7; i++) {
    const next      = new Date(date + "T00:00:00")
    next.setDate(next.getDate() + i)
    const nextDate  = next.toISOString().split("T")[0]
    const nextSlots = await getAvailableSlots(nextDate, duration)
    if (nextSlots.length > 0) {
      return `No availability on ${dateLabel(date)}. The next available day is ${dateLabel(nextDate)}.`
    }
  }

  return "No availability found in the next week. Please call us to find a suitable time."
}

// ─── Tool: book_appointment ───────────────────────────────────────────────────

async function toolBookAppointment(args: Record<string, unknown>): Promise<string> {
  const patientName = String(args.patient_name ?? "").trim()
  const date        = String(args.date ?? "").trim()
  const time        = String(args.time ?? "").trim()
  const visitType   = String(args.visit_type ?? "other").trim()
  const duration    = typeof args.duration === "number" ? args.duration : 30

  if (!patientName || !date || !time) {
    return "I need the patient name, date, and time to book an appointment."
  }

  const parts     = patientName.split(/\s+/)
  const firstName = parts[0]
  const lastName  = parts.length > 1 ? parts.slice(1).join(" ") : undefined

  const patient = await prisma.patient.findFirst({
    where: lastName
      ? { firstName: { contains: firstName, mode: "insensitive" }, lastName: { contains: lastName, mode: "insensitive" } }
      : { firstName: { contains: firstName, mode: "insensitive" } },
  })
  if (!patient) return `No patient record found for ${patientName}. They may need to register first.`

  const timeMatch = time.replace(/\s+/g, "").match(/^(\d{1,2}):(\d{2})(am|pm)?$/i)
  if (!timeMatch) {
    return `I couldn't understand the time "${time}". Please use a format like 9:15am or 14:30.`
  }

  let hours  = parseInt(timeMatch[1])
  const mins = parseInt(timeMatch[2])
  const ampm = timeMatch[3]?.toLowerCase()
  if (ampm === "pm" && hours !== 12) hours += 12
  if (ampm === "am" && hours === 12) hours  = 0

  const [yr, mo, dy] = date.split("-").map(Number)
  const startTime    = new Date(yr, mo - 1, dy, hours, mins, 0)
  const endTime      = new Date(startTime.getTime() + duration * 60_000)

  await prisma.appointment.create({
    data: {
      patientId: patient.id,
      startTime,
      endTime,
      duration,
      type:      mapVisitType(visitType),
      status:    "SCHEDULED",
      provider:  patient.preferredProvider ?? null,
      reason:    visitType,
      notes:     args.notes ? String(args.notes) : null,
      bookedVia: "VOICE_AGENT",
    },
  })

  const timeDisplay = to12Hour(`${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`)
  const dateDisplay = startTime.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })

  prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })
    .then(admins =>
      prisma.$transaction(
        admins.map(admin =>
          prisma.notification.create({
            data: {
              userId:    admin.id,
              type:      "appointment_booked",
              title:     "Voice Agent Booked Appointment",
              message:   `Voice Agent booked a ${visitType} for ${patient.firstName} ${patient.lastName} on ${dateDisplay} at ${timeDisplay}.`,
              icon:      "check",
              actionUrl: `/patients/${patient.id}`,
            },
          })
        )
      )
    ).catch(err => console.error("[VAPI TOOL] book appointment notification failed:", err))

  void appendSystemMessage({
    patientId: patient.id,
    content: `Appointment booked via voice agent: ${visitType} on ${dateDisplay} at ${timeDisplay}.`,
    metadata: { source: 'vapi', event: 'appointment_booked', visitType, startTime: startTime.toISOString() },
  }).catch((err) => console.error("[VAPI TOOL] book appointment system message failed:", err))

  return `Appointment booked: ${visitType} for ${patient.firstName} ${patient.lastName} on ${dateDisplay} at ${timeDisplay}. Confirmation will be sent.`
}

// ─── Tool: cancel_appointment ─────────────────────────────────────────────────

async function toolCancelAppointment(args: Record<string, unknown>): Promise<string> {
  const patientName = String(args.patient_name ?? "").trim()
  const apptDate    = String(args.appointment_date ?? "").trim()
  const reason      = args.reason ? String(args.reason) : "Cancelled via voice agent"

  if (!patientName || !apptDate) return "I need the patient name and appointment date to cancel."

  const parts     = patientName.split(/\s+/)
  const firstName = parts[0]
  const lastName  = parts.length > 1 ? parts.slice(1).join(" ") : undefined

  const patient = await prisma.patient.findFirst({
    where: lastName
      ? { firstName: { contains: firstName, mode: "insensitive" }, lastName: { contains: lastName, mode: "insensitive" } }
      : { firstName: { contains: firstName, mode: "insensitive" } },
  })
  if (!patient) return `No patient record found for ${patientName}.`

  const [yr, mo, dy] = apptDate.split("-").map(Number)
  const dayStart = new Date(yr, mo - 1, dy,  0,  0,  0,   0)
  const dayEnd   = new Date(yr, mo - 1, dy, 23, 59, 59, 999)

  const appointment = await prisma.appointment.findFirst({
    where:   {
      patientId: patient.id,
      startTime: { gte: dayStart, lte: dayEnd },
      status:    { notIn: ["CANCELLED", "NO_SHOW"] },
    },
    orderBy: { startTime: "asc" },
  })
  if (!appointment) {
    const label = new Date(apptDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })
    return `No active appointment found for ${patientName} on ${label}.`
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data:  { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
  })

  const dateDisplay = appointment.startTime.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })

  prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })
    .then(admins =>
      prisma.$transaction(
        admins.map(admin =>
          prisma.notification.create({
            data: {
              userId:    admin.id,
              type:      "appointment_cancelled",
              title:     "Voice Agent Cancelled Appointment",
              message:   `Voice Agent cancelled ${patient.firstName} ${patient.lastName}'s appointment on ${dateDisplay}. Reason: ${reason}`,
              icon:      "alert",
              actionUrl: `/patients/${patient.id}`,
            },
          })
        )
      )
    ).catch(err => console.error("[VAPI TOOL] cancel appointment notification failed:", err))

  void appendSystemMessage({
    patientId: patient.id,
    content: `Appointment cancelled via voice agent on ${dateDisplay}. Reason: ${reason}`,
    metadata: { source: 'vapi', event: 'appointment_cancelled', appointmentId: appointment.id, reason },
  }).catch((err) => console.error("[VAPI TOOL] cancel appointment system message failed:", err))

  return `Cancelled ${patient.firstName} ${patient.lastName}'s appointment on ${dateDisplay}. Would they like to reschedule?`
}

// ─── Tool: verify_insurance ───────────────────────────────────────────────────

function toolVerifyInsurance(args: Record<string, unknown>): string {
  const rawInput = String(args.plan_name ?? "").trim()
  if (!rawInput) return "Please provide the insurance plan name."
  const input = rawInput.toLowerCase().replace(/[-–]/g, " ").replace(/\s+/g, " ")

  // Generic Apple Health / Medicaid inquiry — no specific plan named
  if (
    /\b(apple health|medicaid|chip|wa apple)\b/.test(input) &&
    !APPLE_HEALTH_PLANS.some(p => input.includes(p.toLowerCase()))
  ) {
    return "We accept these Apple Health plans: Coordinated Care, Molina, United Healthcare, and Wellpoint."
  }

  // Plans we do NOT accept
  if (input.includes("kaiser")) {
    return "Kaiser is not currently accepted. Accepted Apple Health plans are: Coordinated Care, Molina, United Healthcare, and Wellpoint."
  }
  if (input.includes("community health plan")) {
    return "Community Health Plan of Washington is not currently accepted. Accepted Apple Health plans are: Coordinated Care, Molina, United Healthcare, and Wellpoint."
  }
  if (/blue cross.+illinois|illinois.+blue cross/.test(input)) {
    return "Blue Cross of Illinois is not currently accepted. Accepted Apple Health plans are: Coordinated Care, Molina, United Healthcare, and Wellpoint."
  }

  // Fuzzy match accepted plans (order matters — Premera before generic "blue cross")
  for (const entry of PLAN_KEYWORDS) {
    if (entry.keywords.some(k => input.includes(k))) {
      // Intentionally omit planType from the tool result — the voice agent
      // would otherwise echo internal labels like "Plan type: Commercial".
      return `Yes, ${entry.plan} is accepted.`
    }
  }

  return "I'm not sure about that plan. The billing team can verify during business hours."
}

// ─── Tool: submit_refill_request ──────────────────────────────────────────────

async function toolSubmitRefillRequest(args: Record<string, unknown>): Promise<string> {
  const patientName = String(args.patient_name ?? "").trim()
  const medication  = String(args.medication_name ?? "").trim()
  const pharmacy    = String(args.pharmacy_name ?? "").trim()
  const isUrgent    = Boolean(args.is_urgent)

  const title   = `${isUrgent ? "[URGENT] " : ""}Refill Request: ${medication}`
  const message = `Patient: ${patientName}${args.patient_dob ? ` (DOB: ${args.patient_dob})` : ""}. Medication: ${medication}. Pharmacy: ${pharmacy || "not specified"}. Urgent: ${isUrgent ? "yes" : "no"}.`

  const parts     = patientName.split(/\s+/)
  const firstName = parts[0]
  const lastName  = parts.length > 1 ? parts.slice(1).join(" ") : undefined
  const pt = await prisma.patient.findFirst({
    where: lastName
      ? { firstName: { contains: firstName, mode: "insensitive" }, lastName: { contains: lastName, mode: "insensitive" } }
      : { firstName: { contains: firstName, mode: "insensitive" } },
    select: { id: true },
  })
  const refillActionUrl = pt
    ? `/patients/${pt.id}`
    : `/patients?search=${encodeURIComponent(patientName)}`

  const admins = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })
  prisma.$transaction(
    admins.map(admin =>
      prisma.notification.create({
        data: {
          userId:    admin.id,
          type:      "refill_request",
          title,
          message,
          icon:      isUrgent ? "alert" : "info",
          actionUrl: refillActionUrl,
        },
      })
    )
  ).catch(err => console.error("[VAPI TOOL] refill notification failed:", err))

  return `Refill request submitted for ${medication} at ${pharmacy || "the specified pharmacy"}. Our clinical team will process it.`
}

// ─── Tool: send_intake_forms ──────────────────────────────────────────────────

async function toolSendIntakeForms(args: Record<string, unknown>): Promise<string> {
  const childName  = String(args.child_name ?? "").trim()
  const phone      = String(args.phone ?? "").trim()
  const parentName = args.parent_name ? String(args.parent_name).trim() : null
  const formType   = args.form_type   ? String(args.form_type).trim()   : "new patient intake"

  const message = `Intake form request for ${childName}${parentName ? ` (parent: ${parentName})` : ""}. Phone: ${phone}${args.email ? `, Email: ${args.email}` : ""}. Form type: ${formType}.`

  const admins = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })
  prisma.$transaction(
    admins.map(admin =>
      prisma.notification.create({
        data: {
          userId:    admin.id,
          type:      "intake_forms_requested",
          title:     `Intake Form Request: ${childName}`,
          message,
          icon:      "form",
          actionUrl: "/intake-forms",
        },
      })
    )
  ).catch(err => console.error("[VAPI TOOL] intake notification failed:", err))

  return `Intake forms request noted for ${childName}. Our team will send the forms to ${phone}.`
}

// ─── Tool: create_callback_request ───────────────────────────────────────────

async function toolCreateCallbackRequest(args: Record<string, unknown>): Promise<string> {
  const callerName = String(args.caller_name ?? "").trim()
  const phone      = String(args.phone ?? "").trim()
  const reason     = String(args.reason ?? "").trim()
  const urgency    = args.urgency    ? String(args.urgency).trim()    : "normal"
  const childName  = args.child_name ? String(args.child_name).trim() : null

  const message = `Callback request from ${callerName} at ${phone}.${childName ? ` Child: ${childName}.` : ""} Reason: ${reason}. Urgency: ${urgency}.`

  const admins = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })
  prisma.$transaction(
    admins.map(admin =>
      prisma.notification.create({
        data: {
          userId:    admin.id,
          type:      "callback_request",
          title:     `Callback Request: ${callerName}`,
          message,
          icon:      urgency === "urgent" ? "alert" : "phone",
          actionUrl: "/notifications",
        },
      })
    )
  ).catch(err => console.error("[VAPI TOOL] callback notification failed:", err))

  return `Callback request created. Our team will call ${callerName} at ${phone}.`
}

// ─── Tool: transfer_to_human ──────────────────────────────────────────────────

async function toolTransferToHuman(args: Record<string, unknown>): Promise<string> {
  const reason      = String(args.reason ?? "Transfer requested").trim()
  const notes       = args.notes        ? String(args.notes).trim()        : null
  const patientName = args.patient_name ? String(args.patient_name).trim() : null

  const message = `Transfer context: ${reason}.${patientName ? ` Patient: ${patientName}.` : ""}${notes ? ` Notes: ${notes}.` : ""}`

  const admins = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })
  prisma.$transaction(
    admins.map(admin =>
      prisma.notification.create({
        data: {
          userId:    admin.id,
          type:      "transfer_context",
          title:     `Incoming Transfer${patientName ? `: ${patientName}` : ""}`,
          message,
          icon:      "alert",
          actionUrl: "/call-logs",
        },
      })
    )
  ).catch(err => console.error("[VAPI TOOL] transfer notification failed:", err))

  return `Transferring now. Reason: ${reason}.${notes ? ` Context: ${notes}.` : ""}`
}

// ─── Vapi tool call dispatcher ────────────────────────────────────────────────

// Vapi uses OpenAI-compatible format: name + arguments are nested under "function",
// and arguments is a JSON-encoded string (not a parsed object).
interface VapiToolCall {
  id:       string
  type?:    string
  function: {
    name:      string
    arguments: string  // JSON-encoded string
  }
}

async function dispatchToolCalls(
  toolCallList: VapiToolCall[]
): Promise<{ toolCallId: string; result: string }[]> {
  return Promise.all(
    toolCallList.map(async (tc) => {
      const toolName = tc.function?.name
      let args: Record<string, unknown> = {}
      try {
        const raw = tc.function?.arguments ?? "{}"
        args = typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, unknown>)
      } catch {
        // malformed arguments — keep empty object
      }

      console.log(`[VAPI TOOL] dispatch — name: ${toolName}, id: ${tc.id}, args:`, JSON.stringify(args))

      try {
        let result: string
        switch (toolName) {
          case "lookup_patient":          result = await toolLookupPatient(args);          break
          case "check_availability":      result = await toolCheckAvailability(args);      break
          case "book_appointment":        result = await toolBookAppointment(args);        break
          case "cancel_appointment":      result = await toolCancelAppointment(args);      break
          case "verify_insurance":        result = toolVerifyInsurance(args);              break
          case "submit_refill_request":   result = await toolSubmitRefillRequest(args);    break
          case "send_intake_forms":       result = await toolSendIntakeForms(args);        break
          case "create_callback_request": result = await toolCreateCallbackRequest(args);  break
          case "transfer_to_human":       result = await toolTransferToHuman(args);        break
          default:
            result = `Unknown tool: ${toolName}. Please try again.`
        }
        return { toolCallId: tc.id, result }
      } catch (err) {
        console.error(`[VAPI TOOL] ${toolName} failed:`, err)
        return { toolCallId: tc.id, result: "Something went wrong. Please try again or call us directly." }
      }
    })
  )
}

// ─── Core processor ────────────────────────────────────────────────────────────

export async function processVapiEndOfCall(
  report: VapiEndOfCallReport,
  requestIp: string | null,
  isPhoneCall = true,   // true = end-of-call-report → CallLog only
                        // false = conversation-update → ChatLog only
): Promise<{ chatLogId: string | null; callLogId: string | null; alreadyExists?: boolean }> {
  const call = report.call

  // ── Shared data extraction ─────────────────────────────────────────────────
  const rawMessages: VapiMessage[] = report.artifact?.messages ?? report.messages ?? []
  const transcript   = report.artifact?.transcript ?? report.transcript ?? ""
  const summary      = report.summary ?? ""
  const recordingUrl = report.artifact?.recordingUrl ?? report.recordingUrl ?? null

  const mapped   = mapMessages(rawMessages)
  const combined = `${summary} ${transcript}`

  const visitorName  = call.customer?.name   ?? null
  const visitorPhone = call.customer?.number ?? null
  const visitorEmail = call.customer?.email  ?? null

  const startTime = call.startedAt ? new Date(call.startedAt) : new Date()
  const endTime   = call.endedAt   ? new Date(call.endedAt)   : null
  const duration  = endTime ? Math.round((endTime.getTime() - startTime.getTime()) / 1000) : null

  // ── Patient matching — 5-level cascade ────────────────────────────────────
  const sd            = report.analysis?.structuredData
  const normPhone     = visitorPhone ? normalizePhone(visitorPhone) : null
  let patientId: string | null = null

  // 1. Exact phone match
  if (!patientId && visitorPhone) {
    const m = await prisma.patient.findFirst({ where: { phone: visitorPhone }, select: { id: true } })
    if (m) patientId = m.id
  }

  // 2. Normalized phone match (strips country code / formatting)
  if (!patientId && normPhone && normPhone !== visitorPhone) {
    const all = await prisma.patient.findMany({ select: { id: true, phone: true } })
    const match = all.find(p => p.phone && normalizePhone(p.phone) === normPhone)
    if (match) patientId = match.id
  }

  // 3. Parent phone match
  if (!patientId && visitorPhone) {
    const m = await prisma.patient.findFirst({ where: { parentPhone: visitorPhone }, select: { id: true } })
    if (m) patientId = m.id
  }

  // 4. Email match
  if (!patientId && visitorEmail) {
    const m = await prisma.patient.findFirst({
      where: { email: { equals: visitorEmail, mode: "insensitive" } },
      select: { id: true },
    })
    if (m) patientId = m.id
  }

  // 5. Patient name match from Vapi structuredData (e.g. "John Smith" → search firstName + lastName)
  if (!patientId && sd?.patientName) {
    const parts = sd.patientName.trim().split(/\s+/)
    if (parts.length >= 2) {
      const firstName = parts[0]
      const lastName  = parts.slice(1).join(" ")
      const m = await prisma.patient.findFirst({
        where: {
          firstName: { equals: firstName, mode: "insensitive" },
          lastName:  { equals: lastName,  mode: "insensitive" },
        },
        select: { id: true },
      })
      if (m) patientId = m.id
    }
  }

  // ── PHONE CALL → CallLog only ──────────────────────────────────────────────
  if (isPhoneCall) {
    const existing = await prisma.callLog.findUnique({
      where: { vapiCallId: call.id }, select: { id: true },
    })
    if (existing) return { chatLogId: null, callLogId: existing.id, alreadyExists: true }

    // Prefer Vapi structuredData over regex inference
    const callIntent = (sd?.callIntent as CallIntentType | undefined)
      ?? inferCallIntent(combined)
    const callOutcome = sd?.appointmentConfirmed
      ? "BOOKED"
      : sd?.wasEscalated
      ? "TRANSFERRED"
      : inferCallOutcome(summary, transcript, report.endedReason, mapped.length)
    const sentiment   = inferSentiment(transcript)

    // Extract caller name: Vapi customer.name → structuredData → transcript patterns
    const resolvedCallerName = visitorName ?? sd?.callerName ?? extractNameFromTranscript(transcript)

    let callLogId: string | null = null
    try {
      const callLog = await prisma.callLog.create({
        data: {
          callerName:       resolvedCallerName,
          callerPhone:      visitorPhone ?? "unknown",
          startTime,
          endTime,
          duration,
          intent:           callIntent,
          outcome:          callOutcome,
          sentiment,
          transcript:       transcript || null,
          summary:          summary || null,
          recordingUrl,
          vapiCallId:       call.id,
          wasEscalated:     callOutcome === "TRANSFERRED",
          escalationReason: callOutcome === "TRANSFERRED" ? "Escalated via Vapi" : null,
          appointmentBooked: callOutcome === "BOOKED",
          patientId,
        },
      })
      callLogId = callLog.id
    } catch (err) {
      console.error("[VAPI WEBHOOK] CallLog write failed:", err)
    }

    // Audit
    await prisma.auditLog.create({
      data: {
        userId: null, action: "CREATE", entity: "call_log", entityId: callLogId ?? call.id,
        changes: { source: "vapi_webhook", vapiCallId: call.id, callType: call.type ?? "webCall" },
        ipAddress: requestIp, userAgent: "Vapi-Webhook", timestamp: new Date(),
      },
    })

    // Notifications
    try {
      const admins = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })
      const callerLabel   = visitorName ?? visitorPhone ?? "Unknown caller"
      const durationLabel = duration ? `${Math.floor(duration / 60)}m ${duration % 60}s` : null
      let title   = "New Call Received"
      let message = `${callerLabel}${durationLabel ? ` · ${durationLabel}` : ""} · ${callIntent.replace(/_/g, " ").toLowerCase()}`
      let icon    = "phone"
      if (callOutcome === "BOOKED") {
        title = "Appointment Booked via Call"
        message = `${callerLabel} booked an appointment${durationLabel ? ` · ${durationLabel}` : ""}`
        icon  = "check"
      } else if (callOutcome === "TRANSFERRED") {
        title = "Call Escalated to Staff"
        message = `${callerLabel} requested a human agent${durationLabel ? ` · ${durationLabel}` : ""}`
        icon  = "alert"
      } else if (callOutcome === "HUNG_UP" || callOutcome === "VOICEMAIL") {
        title = callOutcome === "VOICEMAIL" ? "Voicemail Left" : "Missed Call"
        icon  = "alert"
      }
      for (const admin of admins) {
        await prisma.notification.create({
          data: { userId: admin.id, type: "call_received", title, message, icon,
            entityType: "call_log", entityId: callLogId ?? undefined, actionUrl: "/call-logs" },
        })
      }
    } catch (err) {
      console.error("[VAPI WEBHOOK] Notification failed:", err)
    }

    return { chatLogId: null, callLogId }
  }

  // ── CHATBOT CONVERSATION → ChatLog only ────────────────────────────────────
  const existing = await prisma.chatLog.findUnique({
    where: { sessionId: call.id }, select: { id: true },
  })
  if (existing) return { chatLogId: existing.id, callLogId: null, alreadyExists: true }

  const topic       = inferTopic(combined)
  const chatOutcome = inferChatOutcome(summary, transcript, report.endedReason, mapped.length)

  const chatLog = await prisma.chatLog.create({
    data: {
      sessionId:         call.id,
      visitorName,
      visitorEmail,
      visitorPhone,
      startTime,
      endTime,
      messageCount:      mapped.length,
      topic,
      outcome:           chatOutcome,
      messages:          JSON.parse(JSON.stringify(mapped)),
      summary:           summary || null,
      sourcePage:        null,
      deviceType:        call.type === "webCall" ? "Desktop" : null,
      browser:           null,
      leadCaptured:      chatOutcome === "LEAD_CAPTURED",
      appointmentBooked: chatOutcome === "BOOKED",
      patientId,
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: null, action: "CREATE", entity: "chat_log", entityId: chatLog.id,
      changes: { source: "vapi_webhook", vapiCallId: call.id, callType: call.type ?? "webCall" },
      ipAddress: requestIp, userAgent: "Vapi-Webhook", timestamp: new Date(),
    },
  })

  return { chatLogId: chatLog.id, callLogId: null }
}

// ─── POST /api/webhooks/vapi ───────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── Secret verification ────────────────────────────────────────────────────
  const vapiSecret = process.env.VAPI_WEBHOOK_SECRET
  if (vapiSecret) {
    const incoming = request.headers.get("x-vapi-secret")
    if (incoming !== vapiSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const eventType = (body?.message as Record<string, unknown>)?.type ?? body?.type ?? "unknown"
  console.log("[VAPI WEBHOOK] event type:", eventType)
  console.log("[VAPI WEBHOOK] full body:", JSON.stringify(body, null, 2))

  const msg     = body?.message as Record<string, unknown> | undefined
  const payload = msg ?? body
  const type    = (payload?.type as string) ?? "unknown"

  if (type === "conversation-update" || type === "end-of-call-report") {
    const call = (payload?.call as VapiCall) ?? { id: (payload?.sessionId as string) ?? `chat_${Date.now()}` }
    if (!call.id) {
      return NextResponse.json({ error: "Missing call id" }, { status: 400 })
    }

    if (type === "conversation-update") {
      const status = (payload?.status as string) ?? ""
      if (status !== "ended" && status !== "complete") {
        return NextResponse.json({ received: true, processed: false, reason: "conversation still in progress" })
      }
    }

    const report: VapiEndOfCallReport = {
      type:        "end-of-call-report",
      call,
      transcript:  payload?.transcript as string | undefined,
      summary:     payload?.summary as string | undefined,
      messages:    payload?.messages as VapiMessage[] | undefined,
      endedReason: payload?.endedReason as string | undefined,
      artifact:    payload?.artifact as VapiArtifact | undefined,
      recordingUrl: payload?.recordingUrl as string | undefined,
      analysis:    payload?.analysis as VapiAnalysis | undefined,
    }

    try {
      const ip          = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? null
      const isPhoneCall = type === "end-of-call-report"
      const result = await processVapiEndOfCall(report, ip, isPhoneCall)
      if (result.alreadyExists) {
        return NextResponse.json({ received: true, processed: false, reason: "duplicate", chatLogId: result.chatLogId, callLogId: result.callLogId })
      }
      return NextResponse.json({ received: true, processed: true, chatLogId: result.chatLogId, callLogId: result.callLogId }, { status: 201 })
    } catch (err) {
      console.error("[POST /api/webhooks/vapi]", err)
      return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
    }
  }

  // ── tool-calls: Vapi is invoking a server-side tool mid-call ─────────────────
  if (type === "tool-calls") {
    console.log("[VAPI TOOL-CALLS] raw body:", JSON.stringify(body, null, 2))
    console.log("[VAPI TOOL-CALLS] extracted type:", type)
    const rawList      = payload?.toolCallList
    console.log("[VAPI TOOL-CALLS] toolCallList:", JSON.stringify(rawList, null, 2))
    const toolCallList = Array.isArray(rawList) ? (rawList as VapiToolCall[]) : []
    toolCallList.forEach(tc => {
      console.log(`[VAPI TOOL-CALLS] tool — name: ${tc.function?.name}, id: ${tc.id}`)
    })
    try {
      const results = await dispatchToolCalls(toolCallList)
      return NextResponse.json({ results })
    } catch (err) {
      console.error("[VAPI WEBHOOK] tool-calls dispatch error:", err)
      return NextResponse.json({
        results: toolCallList.map(tc => ({
          toolCallId: tc.id,
          result:     "Something went wrong. Please try again or call us directly.",
        })),
      })
    }
  }

  return NextResponse.json({ received: true, processed: false, type })
}

// ─── GET /api/webhooks/vapi (health check) ────────────────────────────────────

export async function GET() {
  return NextResponse.json({ status: "Vapi webhook receiver is active", timestamp: new Date().toISOString() })
}
