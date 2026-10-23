import "dotenv/config"
import { PrismaClient } from "../lib/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"
import {
  DEFAULT_APPOINTMENT_TYPES,
  DEFAULT_BOOKING_POLICY,
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_HOLIDAYS,
  DEFAULT_IDENTITY,
  DEFAULT_INSURERS,
  DEFAULT_LUNCH_BREAK,
  DEFAULT_PRACTICE,
  DEFAULT_PROVIDERS,
} from "../lib/clinic/settings"
import { CLINIC_FAQ } from "../lib/knowledge/defaults"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

/**
 * This seed DELETES every table before inserting demo data. It must never run
 * against the clinic's real database. It refuses unless the database is local
 * or SEED_ALLOW_DESTRUCTIVE=yes is set explicitly, and never in production.
 */
function assertSafeToSeed(): string {
  const url = process.env.DATABASE_URL ?? ""
  let host = ""
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error("DATABASE_URL is missing or invalid.")
  }
  const local = ["localhost", "127.0.0.1", "::1"].includes(host)
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed: NODE_ENV=production.")
  if (!local && process.env.SEED_ALLOW_DESTRUCTIVE !== "yes") {
    throw new Error(`Refusing to wipe and seed the database at ${host}. This seed deletes all data. Set SEED_ALLOW_DESTRUCTIVE=yes only for a disposable non-production database.`)
  }
  const password = process.env.SEED_ADMIN_PASSWORD ?? ""
  if (password.length < 10) throw new Error("Set SEED_ADMIN_PASSWORD (at least 10 characters) for the seeded admin accounts.")
  return password
}

async function main() {
  const seedPassword = assertSafeToSeed()
  console.log("🌱 Seeding database...")

  // ── 1. CLEAN existing data (order respects FK constraints) ──────────────────
  await prisma.notification.deleteMany()
  await prisma.auditLog.deleteMany()
  await prisma.intakeFormAccessControl.deleteMany()
  await prisma.intakeFormFieldValue.deleteMany()
  await prisma.intakeForm.deleteMany()
  await prisma.patientDraft.deleteMany()
  await prisma.knowledgeItem.deleteMany()
  await prisma.document.deleteMany()
  await prisma.patientNote.deleteMany()
  await prisma.chatLog.deleteMany()
  await prisma.callLog.deleteMany()
  await prisma.appointment.deleteMany()
  await prisma.patient.deleteMany()
  await prisma.settings.deleteMany()
  await prisma.user.deleteMany()

  // ── 2. USERS ────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(seedPassword, 12)

  const admin = await prisma.user.create({
    data: {
      email: "jonathan@kids0218.com",
      passwordHash,
      firstName: "Jonathan",
      lastName: "Tomás",
      role: "ADMIN",
      jobTitle: "APRN, MSN, NNP-BC, CPNP-PC/AC — Owner, Neonatal & Pediatric Nurse Practitioner",
      isActive: true,
      approvalStatus: "APPROVED",
      twoFactorEnabled: false,
    },
  })

  const admin2 = await prisma.user.create({
    data: {
      email: "ebadraja1402@gmail.com",
      passwordHash,
      firstName: "Ebad",
      lastName: "Raja",
      role: "ADMIN",
      jobTitle: "CRM Administrator",
      isActive: true,
      approvalStatus: "APPROVED",
      twoFactorEnabled: false,
    },
  })

  const receptionist = admin2
  const nurse = admin

  console.log("  ✓ Users (2 — real admin accounts)")

  // ── 3. PATIENTS ─────────────────────────────────────────────────────────────
  const patients = await Promise.all([
    prisma.patient.create({
      data: {
        firstName: "Liam",
        lastName: "Martinez",
        dateOfBirth: new Date("2020-03-15"),
        gender: "MALE",
        phone: "(555) 301-1001",
        email: "carlos.martinez@gmail.com",
        address: "124 Maple Street",
        city: "Austin",
        state: "TX",
        zipCode: "78701",
        parentName: "Carlos Martinez",
        parentRelation: "Father",
        parentPhone: "(555) 301-1001",
        parentEmail: "carlos.martinez@gmail.com",
        emergencyContact: "Rosa Martinez",
        emergencyPhone: "(555) 301-1002",
        insuranceProvider: "Blue Cross Blue Shield",
        insuranceId: "BCBS-TX-884412",
        allergies: "Penicillin",
        preferredLanguage: "English",
        preferredProvider: "P. Jonathan Tomás, APRN",
        status: "ACTIVE",
        totalVisits: 8,
        lastVisitAt: new Date("2024-04-22T10:00:00Z"),
        patientSince: new Date("2021-01-10"),
        createdById: admin.id,
      },
    }),

    prisma.patient.create({
      data: {
        firstName: "Sofia",
        lastName: "Patel",
        dateOfBirth: new Date("2017-07-28"),
        gender: "FEMALE",
        phone: "(555) 302-2001",
        email: "priya.patel@yahoo.com",
        address: "88 Sunflower Lane",
        city: "Austin",
        state: "TX",
        zipCode: "78704",
        parentName: "Priya Patel",
        parentRelation: "Mother",
        parentPhone: "(555) 302-2001",
        parentEmail: "priya.patel@yahoo.com",
        emergencyContact: "Raj Patel",
        emergencyPhone: "(555) 302-2002",
        insuranceProvider: "Aetna",
        insuranceId: "AET-990071",
        allergies: "Sulfa drugs, Tree nuts",
        medications: "Zyrtec 5mg daily",
        preferredLanguage: "English",
        preferredProvider: "P. Jonathan Tomás, APRN",
        status: "ACTIVE",
        totalVisits: 14,
        lastVisitAt: new Date("2024-05-10T09:30:00Z"),
        patientSince: new Date("2019-08-05"),
        createdById: receptionist.id,
      },
    }),

    prisma.patient.create({
      data: {
        firstName: "Noah",
        lastName: "Thompson",
        dateOfBirth: new Date("2015-11-03"),
        gender: "MALE",
        phone: "(555) 303-3001",
        email: "jessica.thompson@hotmail.com",
        address: "210 Riverside Drive",
        city: "Round Rock",
        state: "TX",
        zipCode: "78664",
        parentName: "Jessica Thompson",
        parentRelation: "Mother",
        parentPhone: "(555) 303-3001",
        parentEmail: "jessica.thompson@hotmail.com",
        emergencyContact: "Mark Thompson",
        emergencyPhone: "(555) 303-3002",
        insuranceProvider: "United Healthcare",
        insuranceId: "UHC-551234",
        allergies: "None known",
        medications: "Albuterol inhaler PRN",
        medicalNotes: "Mild persistent asthma. Uses rescue inhaler before exercise.",
        preferredLanguage: "English",
        status: "ACTIVE",
        totalVisits: 22,
        lastVisitAt: new Date("2024-05-01T11:00:00Z"),
        patientSince: new Date("2016-02-18"),
        createdById: admin.id,
      },
    }),

    prisma.patient.create({
      data: {
        firstName: "Amara",
        lastName: "Okafor",
        dateOfBirth: new Date("2022-01-19"),
        gender: "FEMALE",
        phone: "(555) 304-4001",
        email: "adaeze.okafor@gmail.com",
        address: "57 Cedar Creek Blvd",
        city: "Austin",
        state: "TX",
        zipCode: "78745",
        parentName: "Adaeze Okafor",
        parentRelation: "Mother",
        parentPhone: "(555) 304-4001",
        parentEmail: "adaeze.okafor@gmail.com",
        emergencyContact: "Chidi Okafor",
        emergencyPhone: "(555) 304-4002",
        insuranceProvider: "Cigna",
        insuranceId: "CIG-774422",
        preferredLanguage: "English",
        status: "ACTIVE",
        totalVisits: 5,
        lastVisitAt: new Date("2024-04-15T14:00:00Z"),
        patientSince: new Date("2022-02-01"),
        createdById: receptionist.id,
      },
    }),

    prisma.patient.create({
      data: {
        firstName: "Ethan",
        lastName: "Kim",
        dateOfBirth: new Date("2010-09-22"),
        gender: "MALE",
        phone: "(555) 305-5001",
        email: "hyunjin.kim@gmail.com",
        address: "1400 Tech Ridge Pkwy",
        city: "Austin",
        state: "TX",
        zipCode: "78758",
        parentName: "Hyunjin Kim",
        parentRelation: "Father",
        parentPhone: "(555) 305-5001",
        parentEmail: "hyunjin.kim@gmail.com",
        emergencyContact: "Soyeon Kim",
        emergencyPhone: "(555) 305-5002",
        insuranceProvider: "Blue Cross Blue Shield",
        insuranceId: "BCBS-TX-112233",
        allergies: "Latex",
        medications: "Concerta 18mg daily",
        medicalNotes: "ADHD diagnosis 2022. Annual medication review required.",
        preferredLanguage: "English",
        status: "ACTIVE",
        totalVisits: 31,
        lastVisitAt: new Date("2024-03-28T10:30:00Z"),
        patientSince: new Date("2012-05-14"),
        createdById: admin.id,
      },
    }),

    prisma.patient.create({
      data: {
        firstName: "Isabella",
        lastName: "Rodriguez",
        dateOfBirth: new Date("2018-05-06"),
        gender: "FEMALE",
        phone: "(555) 306-6001",
        email: "ana.rodriguez@outlook.com",
        address: "320 Blossom Trail",
        city: "Cedar Park",
        state: "TX",
        zipCode: "78613",
        parentName: "Ana Rodriguez",
        parentRelation: "Mother",
        parentPhone: "(555) 306-6001",
        parentEmail: "ana.rodriguez@outlook.com",
        emergencyContact: "Miguel Rodriguez",
        emergencyPhone: "(555) 306-6002",
        insuranceProvider: "Humana",
        insuranceId: "HUM-336699",
        preferredLanguage: "Spanish",
        status: "ACTIVE",
        totalVisits: 11,
        lastVisitAt: new Date("2024-05-08T13:00:00Z"),
        patientSince: new Date("2018-06-20"),
        createdById: receptionist.id,
      },
    }),

    prisma.patient.create({
      data: {
        firstName: "Mason",
        lastName: "Williams",
        dateOfBirth: new Date("2006-12-14"),
        gender: "MALE",
        phone: "(555) 307-7001",
        email: "diane.williams@gmail.com",
        address: "910 Horizon Blvd",
        city: "Pflugerville",
        state: "TX",
        zipCode: "78660",
        parentName: "Diane Williams",
        parentRelation: "Mother",
        parentPhone: "(555) 307-7001",
        parentEmail: "diane.williams@gmail.com",
        emergencyContact: "Robert Williams",
        emergencyPhone: "(555) 307-7002",
        insuranceProvider: "Aetna",
        insuranceId: "AET-887766",
        allergies: "Amoxicillin",
        preferredLanguage: "English",
        status: "ACTIVE",
        totalVisits: 18,
        lastVisitAt: new Date("2024-02-14T09:00:00Z"),
        patientSince: new Date("2008-01-07"),
        createdById: admin.id,
      },
    }),

    prisma.patient.create({
      data: {
        firstName: "Zoe",
        lastName: "Anderson",
        dateOfBirth: new Date("2023-08-30"),
        gender: "FEMALE",
        phone: "(555) 308-8001",
        email: "karen.anderson@icloud.com",
        address: "42 Bluebell Way",
        city: "Austin",
        state: "TX",
        zipCode: "78750",
        parentName: "Karen Anderson",
        parentRelation: "Mother",
        parentPhone: "(555) 308-8001",
        parentEmail: "karen.anderson@icloud.com",
        emergencyContact: "Tom Anderson",
        emergencyPhone: "(555) 308-8002",
        insuranceProvider: "United Healthcare",
        insuranceId: "UHC-998877",
        preferredLanguage: "English",
        status: "ACTIVE",
        totalVisits: 3,
        lastVisitAt: new Date("2024-05-05T15:00:00Z"),
        patientSince: new Date("2023-09-10"),
        createdById: nurse.id,
      },
    }),
  ])

  const [liam, sofia, noah, amara, ethan, isabella, mason, zoe] = patients
  console.log("  ✓ Patients (8)")

  // ── 4. APPOINTMENTS ─────────────────────────────────────────────────────────
  const appts = await Promise.all([
    // Past completed
    prisma.appointment.create({
      data: {
        patientId: liam.id,
        startTime: new Date("2024-04-22T10:00:00Z"),
        endTime: new Date("2024-04-22T10:30:00Z"),
        duration: 30,
        type: "EVALUATION",
        status: "COMPLETED",
        provider: "P. Jonathan Tomás, APRN",
        reason: "3-year well child visit",
        notes: "Growth on track. Vaccines up to date. No concerns.",
        bookedVia: "STAFF",
        confirmedAt: new Date("2024-04-20T09:00:00Z"),
        confirmedVia: "phone",
        createdById: receptionist.id,
      },
    }),

    prisma.appointment.create({
      data: {
        patientId: sofia.id,
        startTime: new Date("2024-05-10T09:30:00Z"),
        endTime: new Date("2024-05-10T10:00:00Z"),
        duration: 30,
        type: "EMERGENCY",
        status: "COMPLETED",
        provider: "P. Jonathan Tomás, APRN",
        reason: "Fever and sore throat for 2 days",
        notes: "Strep test positive. Prescribed amoxicillin 400mg BID x 10 days.",
        bookedVia: "VOICE_AGENT",
        confirmedAt: new Date("2024-05-09T14:00:00Z"),
        confirmedVia: "voice_agent",
        createdById: receptionist.id,
      },
    }),

    prisma.appointment.create({
      data: {
        patientId: noah.id,
        startTime: new Date("2024-05-01T11:00:00Z"),
        endTime: new Date("2024-05-01T11:20:00Z"),
        duration: 20,
        type: "FOLLOW_UP",
        status: "COMPLETED",
        provider: "P. Jonathan Tomás, APRN",
        reason: "Asthma follow-up",
        notes: "Good control on current regimen. Continue Albuterol PRN.",
        bookedVia: "STAFF",
        createdById: nurse.id,
      },
    }),

    prisma.appointment.create({
      data: {
        patientId: ethan.id,
        startTime: new Date("2024-03-28T10:30:00Z"),
        endTime: new Date("2024-03-28T11:00:00Z"),
        duration: 30,
        type: "CONSULTATION",
        status: "COMPLETED",
        provider: "P. Jonathan Tomás, APRN",
        reason: "ADHD medication review",
        notes: "Concerta dose appropriate. Teacher reports improvement. Recheck in 6 months.",
        bookedVia: "STAFF",
        createdById: receptionist.id,
      },
    }),

    // Upcoming / scheduled
    prisma.appointment.create({
      data: {
        patientId: amara.id,
        startTime: new Date("2024-05-21T14:00:00Z"),
        endTime: new Date("2024-05-21T14:30:00Z"),
        duration: 30,
        type: "HYGIENE",
        status: "CONFIRMED",
        provider: "P. Jonathan Tomás, APRN",
        reason: "18-month immunizations (DTaP, IPV, Hib, PCV)",
        bookedVia: "WEBSITE",
        confirmedAt: new Date("2024-05-19T10:00:00Z"),
        confirmedVia: "sms",
        remindersSent: 1,
        createdById: receptionist.id,
      },
    }),

    prisma.appointment.create({
      data: {
        patientId: isabella.id,
        startTime: new Date("2024-05-22T09:00:00Z"),
        endTime: new Date("2024-05-22T09:30:00Z"),
        duration: 30,
        type: "EVALUATION",
        status: "SCHEDULED",
        provider: "P. Jonathan Tomás, APRN",
        reason: "6-year well child visit",
        bookedVia: "VOICE_AGENT",
        remindersSent: 0,
        createdById: receptionist.id,
      },
    }),

    prisma.appointment.create({
      data: {
        patientId: mason.id,
        startTime: new Date("2024-05-23T11:00:00Z"),
        endTime: new Date("2024-05-23T11:30:00Z"),
        duration: 30,
        type: "EVALUATION",
        status: "SCHEDULED",
        provider: "P. Jonathan Tomás, APRN",
        reason: "Annual physical — 17-year-old",
        bookedVia: "WEBSITE",
        remindersSent: 1,
        createdById: receptionist.id,
      },
    }),

    prisma.appointment.create({
      data: {
        patientId: zoe.id,
        startTime: new Date("2024-05-24T15:00:00Z"),
        endTime: new Date("2024-05-24T15:30:00Z"),
        duration: 30,
        type: "EVALUATION",
        status: "CONFIRMED",
        provider: "P. Jonathan Tomás, APRN",
        reason: "9-month well child visit",
        bookedVia: "STAFF",
        confirmedAt: new Date("2024-05-20T08:30:00Z"),
        confirmedVia: "text",
        remindersSent: 1,
        createdById: nurse.id,
      },
    }),

    // Cancelled / no-show examples
    prisma.appointment.create({
      data: {
        patientId: sofia.id,
        startTime: new Date("2024-04-15T10:00:00Z"),
        endTime: new Date("2024-04-15T10:30:00Z"),
        duration: 30,
        type: "EMERGENCY",
        status: "NO_SHOW",
        provider: "P. Jonathan Tomás, APRN",
        reason: "Cough and runny nose",
        bookedVia: "VOICE_AGENT",
        createdById: receptionist.id,
      },
    }),

    prisma.appointment.create({
      data: {
        patientId: liam.id,
        startTime: new Date("2024-05-14T09:00:00Z"),
        endTime: new Date("2024-05-14T09:20:00Z"),
        duration: 20,
        type: "HYGIENE",
        status: "CANCELLED",
        provider: "P. Jonathan Tomás, APRN",
        reason: "Flu vaccine",
        bookedVia: "STAFF",
        cancelledAt: new Date("2024-05-13T16:00:00Z"),
        cancelReason: "Patient has fever — rescheduling when healthy",
        createdById: receptionist.id,
      },
    }),
  ])

  console.log("  ✓ Appointments (10)")

  // ── 5. CALL LOGS ────────────────────────────────────────────────────────────
  await Promise.all([
    prisma.callLog.create({
      data: {
        patientId: sofia.id,
        callerName: "Priya Patel",
        callerPhone: "(555) 302-2001",
        startTime: new Date("2024-05-10T08:45:00Z"),
        endTime: new Date("2024-05-10T08:53:00Z"),
        duration: 480,
        intent: "APPOINTMENT_BOOKING",
        outcome: "BOOKED",
        sentiment: "POSITIVE",
        appointmentBooked: true,
        appointmentId: appts[1].id,
        vapiCallId: "vapi_call_001",
        isReviewed: true,
        transcript: `[00:00] Jenny: Thank you for calling Kids 0-18 Integrated Pediatrics! I'm Jenny. How can I help you today?
[00:05] Caller: Hi, my daughter Sofia has had a fever and sore throat since yesterday. She's 6. I'd like to bring her in today if possible.
[00:12] Jenny: I'm sorry to hear Sofia isn't feeling well. I can definitely help you schedule a sick visit. Can I get your name?
[00:17] Caller: Yes, it's Priya Patel. P-R-I-Y-A.
[00:22] Jenny: Thank you Priya. We have an opening at 9:30 AM this morning. Would that work?
[00:27] Caller: Yes, perfect! That works great.
[00:30] Jenny: Wonderful! I've booked Sofia Patel for a sick visit at 9:30 AM today. You'll receive a confirmation text shortly.`,
        summary: "Mom called to book sick visit for 6-year-old Sofia with fever and sore throat. Booked same-day at 9:30 AM.",
      },
    }),

    prisma.callLog.create({
      data: {
        callerName: "David Chen",
        callerPhone: "(555) 411-9900",
        startTime: new Date("2024-05-18T09:05:00Z"),
        endTime: new Date("2024-05-18T09:11:00Z"),
        duration: 360,
        intent: "APPOINTMENT_BOOKING",
        outcome: "BOOKED",
        sentiment: "POSITIVE",
        appointmentBooked: false,
        vapiCallId: "vapi_call_002",
        isReviewed: false,
        transcript: `[00:00] Jenny: Thank you for calling Kids 0-18 Integrated Pediatrics! I'm Jenny. How can I help?
[00:05] Caller: Hi, I'm calling to schedule my son's annual physical. He just turned 10.
[00:10] Jenny: Wonderful! I'd be happy to set that up. What's your son's name?
[00:14] Caller: His name is Tyler Chen.
[00:16] Jenny: Great. Let me check availability... We have openings next week Tuesday the 28th at 10 AM or Thursday the 30th at 2 PM.
[00:26] Caller: Tuesday at 10 works perfectly.
[00:29] Jenny: Tyler Chen is booked for a well-child visit on Tuesday May 28th at 10 AM. See you then!`,
        summary: "New patient inquiry. Father booked annual physical for 10-year-old Tyler Chen on May 28th at 10 AM.",
      },
    }),

    prisma.callLog.create({
      data: {
        patientId: noah.id,
        callerName: "Jessica Thompson",
        callerPhone: "(555) 303-3001",
        startTime: new Date("2024-05-17T14:20:00Z"),
        endTime: new Date("2024-05-17T14:28:00Z"),
        duration: 480,
        intent: "INQUIRY",
        outcome: "INFO_PROVIDED",
        sentiment: "NEUTRAL",
        appointmentBooked: false,
        vapiCallId: "vapi_call_003",
        isReviewed: true,
        transcript: `[00:00] Jenny: Thank you for calling Kids 0-18 Integrated Pediatrics!
[00:04] Caller: Hi, my son Noah has asthma and the school is asking for an updated action plan. Do you have his on file?
[00:12] Jenny: I can check on that for you. For document requests, I'll need to connect you with our clinical team. Can I place you on a brief hold?
[00:18] Caller: Sure, that's fine.
[00:20] Jenny: Transferring you now to our nurse line. They'll be able to pull Noah's asthma action plan and fax it directly to the school.`,
        summary: "Mom requesting updated asthma action plan for school. Transferred to nurse line for document fulfillment.",
        wasEscalated: true,
        escalationReason: "Document request requiring clinical staff",
        transferredTo: "Nurse Line",
      },
    }),

    prisma.callLog.create({
      data: {
        callerName: "Unknown Caller",
        callerPhone: "(555) 888-1234",
        startTime: new Date("2024-05-16T16:55:00Z"),
        endTime: new Date("2024-05-16T16:57:00Z"),
        duration: 90,
        intent: "INQUIRY",
        outcome: "INFO_PROVIDED",
        sentiment: "NEUTRAL",
        appointmentBooked: false,
        vapiCallId: "vapi_call_004",
        isReviewed: false,
        summary: "Caller asked about office hours and whether the practice accepts new patients. Info provided.",
      },
    }),

    prisma.callLog.create({
      data: {
        patientId: liam.id,
        callerName: "Carlos Martinez",
        callerPhone: "(555) 301-1001",
        startTime: new Date("2024-05-13T15:30:00Z"),
        endTime: new Date("2024-05-13T15:34:00Z"),
        duration: 210,
        intent: "CANCELLATION",
        outcome: "INFO_PROVIDED",
        sentiment: "NEUTRAL",
        appointmentBooked: false,
        vapiCallId: "vapi_call_005",
        isReviewed: true,
        summary: "Father called to cancel Liam's vaccination appointment on May 14th. Liam has a fever. Rescheduling requested once healthy.",
      },
    }),

    prisma.callLog.create({
      data: {
        callerName: "Frustrated Parent",
        callerPhone: "(555) 777-5555",
        startTime: new Date("2024-05-15T11:10:00Z"),
        endTime: new Date("2024-05-15T11:22:00Z"),
        duration: 720,
        intent: "COMPLAINT",
        outcome: "TRANSFERRED",
        sentiment: "NEGATIVE",
        appointmentBooked: false,
        vapiCallId: "vapi_call_006",
        wasEscalated: true,
        escalationReason: "Billing dispute — insurance claim denied",
        transferredTo: "Billing Department",
        flagForFollowUp: true,
        isReviewed: false,
        summary: "Parent upset about denied insurance claim for last month's visit. Transferred to billing. Flagged for follow-up.",
      },
    }),

    prisma.callLog.create({
      data: {
        patientId: ethan.id,
        callerName: "Hyunjin Kim",
        callerPhone: "(555) 305-5001",
        startTime: new Date("2024-05-18T07:50:00Z"),
        endTime: new Date("2024-05-18T07:56:00Z"),
        duration: 360,
        intent: "APPOINTMENT_BOOKING",
        outcome: "BOOKED",
        sentiment: "POSITIVE",
        appointmentBooked: false,
        vapiCallId: "vapi_call_007",
        isReviewed: false,
        summary: "Father called to schedule Ethan's 6-month ADHD medication review. Appointment booked for June 3rd at 11 AM.",
      },
    }),
  ])

  console.log("  ✓ Call logs (7)")

  // ── 7. PATIENT NOTES ────────────────────────────────────────────────────────
  await Promise.all([
    prisma.patientNote.create({
      data: {
        patientId: noah.id,
        authorId: admin.id,
        content: "Patient has well-controlled mild persistent asthma. Uses Albuterol inhaler PRN before exercise and during exacerbations. No ER visits in past 12 months. Parent educated on peak flow monitoring. Action plan sent to school nurse on file.",
        noteType: "MEDICAL",
        isPrivate: false,
      },
    }),

    prisma.patientNote.create({
      data: {
        patientId: ethan.id,
        authorId: admin.id,
        content: "ADHD managed with Concerta 18mg. Teacher reports significant improvement in focus and task completion. No appetite suppression or sleep issues noted by parents. Next medication review scheduled for June 2024. Coordinate with school counselor re: 504 plan renewal.",
        noteType: "MEDICAL",
        isPrivate: false,
      },
    }),

    prisma.patientNote.create({
      data: {
        patientId: sofia.id,
        authorId: nurse.id,
        content: "Strep positive 5/10/24. Prescribed Amoxicillin 400mg BID x 10 days. Parent instructed to keep home until fever-free 24 hours and completing antibiotics for 24 hours. Follow-up call in 3 days if not improving.",
        noteType: "MEDICAL",
        isPrivate: false,
      },
    }),

    prisma.patientNote.create({
      data: {
        patientId: liam.id,
        authorId: receptionist.id,
        content: "Father Carlos called 5/13 to cancel May 14 vaccine appointment — Liam has fever. Rescheduled for next week after he's healthy. Confirmed Penicillin allergy on file.",
        noteType: "ADMINISTRATIVE",
        isPrivate: false,
      },
    }),

    prisma.patientNote.create({
      data: {
        patientId: isabella.id,
        authorId: nurse.id,
        content: "ALERT: Preferred language is Spanish. Mother (Ana) more comfortable speaking Spanish — consider Spanish-speaking staff for calls and appointments when available. Patient chart and consents available in Spanish.",
        noteType: "ALERT",
        isPrivate: false,
      },
    }),

    prisma.patientNote.create({
      data: {
        patientId: mason.id,
        authorId: admin.id,
        content: "Transitioning to adult care in 2025 (turns 18 in December). Begin transition planning at next visit. Provide referral list for adult PCP. Amoxicillin allergy — documented and confirmed on multiple visits.",
        noteType: "FOLLOW_UP",
        isPrivate: false,
      },
    }),
  ])

  console.log("  ✓ Patient notes (6)")

  // ── 8. DOCUMENTS ────────────────────────────────────────────────────────────
  await Promise.all([
    prisma.document.create({
      data: {
        patientId: noah.id,
        fileName: "Noah_Thompson_Asthma_Action_Plan_2024.pdf",
        fileSize: 184320,
        fileType: "application/pdf",
        fileUrl: "https://storage.kids018.com/docs/noah-thompson/asthma-action-plan-2024.pdf",
        category: "MEDICAL_RECORD",
        description: "Updated asthma action plan for school nurse — Green/Yellow/Red zones",
        uploadedBy: "James Wilson",
      },
    }),

    prisma.document.create({
      data: {
        patientId: liam.id,
        fileName: "Liam_Martinez_Intake_Form.pdf",
        fileSize: 245760,
        fileType: "application/pdf",
        fileUrl: "https://storage.kids018.com/docs/liam-martinez/intake-form.pdf",
        category: "INTAKE_FORM",
        description: "New patient intake form — completed by Carlos Martinez",
        uploadedBy: "Maria Garcia",
      },
    }),

    prisma.document.create({
      data: {
        patientId: sofia.id,
        fileName: "Sofia_Patel_Insurance_Card_Aetna.jpg",
        fileSize: 102400,
        fileType: "image/jpeg",
        fileUrl: "https://storage.kids018.com/docs/sofia-patel/insurance-card-aetna.jpg",
        category: "INSURANCE",
        description: "Aetna insurance card — front and back",
        uploadedBy: "Maria Garcia",
      },
    }),

    prisma.document.create({
      data: {
        patientId: ethan.id,
        fileName: "Ethan_Kim_Photo_Consent.pdf",
        fileSize: 65536,
        fileType: "application/pdf",
        fileUrl: "https://storage.kids018.com/docs/ethan-kim/photo-consent.pdf",
        category: "CONSENT",
        description: "Signed media/photo consent form",
        uploadedBy: "James Wilson",
      },
    }),

    prisma.document.create({
      data: {
        patientId: amara.id,
        fileName: "Amara_Okafor_Vaccine_Record.pdf",
        fileSize: 158720,
        fileType: "application/pdf",
        fileUrl: "https://storage.kids018.com/docs/amara-okafor/vaccine-record.pdf",
        category: "MEDICAL_RECORD",
        description: "Complete immunization record from birth",
        uploadedBy: "James Wilson",
      },
    }),
  ])

  console.log("  ✓ Documents (5)")

  // ── 9. SETTINGS ─────────────────────────────────────────────────────────────
  // Clinic facts (dental-website/website-requirements.md §1) — the same defaults the CRM uses.
  await prisma.settings.create({
    data: {
      practiceName: DEFAULT_PRACTICE.name,
      practiceTagline: DEFAULT_PRACTICE.tagline,
      practicePhone: DEFAULT_PRACTICE.phone,
      practiceEmail: DEFAULT_PRACTICE.email,
      practiceAddress: DEFAULT_PRACTICE.address,
      practiceWebsite: DEFAULT_PRACTICE.website,
      timezone: "Europe/Lisbon",
      locale: "pt-PT",
      businessHours: DEFAULT_BUSINESS_HOURS,
      lunchBreak: DEFAULT_LUNCH_BREAK,
      holidays: DEFAULT_HOLIDAYS,
      appointmentTypes: DEFAULT_APPOINTMENT_TYPES,
      bookingPolicy: DEFAULT_BOOKING_POLICY,
      providers: DEFAULT_PROVIDERS,
      insurers: DEFAULT_INSURERS,
      clinicIdentity: DEFAULT_IDENTITY,
      voiceAgentEnabled: true,
      voiceAgentName: "Acácia",
      emergencyPhone: DEFAULT_PRACTICE.phone,
      notificationEmail: DEFAULT_PRACTICE.email,
      emailEnabled: true,
      emailNewBooking: true,
      emailCancellation: true,
      emailEscalation: true,
      emailNewPatient: true,
    },
  })

  console.log("  ✓ Settings (1)")

  // ── 10. KNOWLEDGE ITEMS ─────────────────────────────────────────────────────
  // The website FAQ, so the site and Acácia give identical answers.
  await prisma.knowledgeItem.createMany({
    data: CLINIC_FAQ.map((f) => ({ ...f, isActive: true, sourceUrl: "dental-website FAQ" })),
  })

  console.log(`  ✓ Knowledge items (${CLINIC_FAQ.length})`)

  // ── 11. AUDIT LOGS ──────────────────────────────────────────────────────────
  await Promise.all([
    prisma.auditLog.create({ data: { userId: admin.id, action: "LOGIN", entity: "user", entityId: admin.id, ipAddress: "192.168.1.10", userAgent: "Chrome/124" } }),
    prisma.auditLog.create({ data: { userId: receptionist.id, action: "LOGIN", entity: "user", entityId: receptionist.id, ipAddress: "192.168.1.11", userAgent: "Chrome/124" } }),
    prisma.auditLog.create({ data: { userId: receptionist.id, action: "CREATE", entity: "patient", entityId: sofia.id, changes: { action: "new patient registered" }, ipAddress: "192.168.1.11" } }),
    prisma.auditLog.create({ data: { userId: receptionist.id, action: "CREATE", entity: "appointment", entityId: appts[1].id, changes: { type: "EMERGENCY", status: "COMPLETED" }, ipAddress: "192.168.1.11" } }),
    prisma.auditLog.create({ data: { userId: admin.id, action: "READ", entity: "patient", entityId: ethan.id, ipAddress: "192.168.1.10" } }),
    prisma.auditLog.create({ data: { userId: nurse.id, action: "UPDATE", entity: "patient", entityId: noah.id, changes: { field: "medicalNotes", updated: true }, ipAddress: "192.168.1.12" } }),
    prisma.auditLog.create({ data: { userId: admin.id, action: "UPDATE", entity: "settings", entityId: "singleton", changes: { voiceAgentEnabled: true }, ipAddress: "192.168.1.10" } }),
  ])

  console.log("  ✓ Audit logs (7)")

  console.log("\n✅ Seed complete!")
  console.log("   2 admin users  |  8 patients  |  10 appointments")
  console.log("   7 call logs    |  6 patient notes")
  console.log("   5 documents    |  10 FAQs      |  7 audit logs")
  console.log("")
  console.log("   Admin logins use the SEED_ADMIN_PASSWORD you provided.")
  console.log("   Patients and calls are synthetic demo records for local development only.")
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
