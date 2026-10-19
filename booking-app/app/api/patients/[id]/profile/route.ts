import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import type { Prisma } from "@/lib/generated/prisma/client"
import { requestMeta, requireStaff } from "@/lib/auth/guards"
import { toE164 } from "@/lib/clinic/phone"
import { isValidNif } from "@/lib/import/zappy"
import { applyPlan } from "@/lib/appointments/notifications"
import { getClinicSettings } from "@/lib/clinic/settings"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

const opt = (max: number) => z.string().trim().max(max).nullable().optional()
const consent = z.boolean().nullable()

const ProfileSchema = z
  .object({
    phone: opt(30),
    phoneNote: opt(120),
    phone2: opt(30),
    phone2Note: opt(120),
    nif: opt(20),
    invoiceName: opt(160),
    invoiceNotes: opt(500),
    referredBy: opt(120),
    clientSource: opt(80),
    birthDay: z.number().int().min(1).max(31).nullable().optional(),
    birthMonth: z.number().int().min(1).max(12).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
    smsRemindersEnabled: z.boolean().optional(),
    emailRemindersEnabled: z.boolean().optional(),
    consents: z
      .object({
        appointments: consent, campaigns: consent, customerRecords: consent, remindersEmail: consent, remindersSms: consent,
        sharePhotos: consent, sharePhotosNoFace: consent, survey: consent,
      })
      .partial()
      .optional(),
  })
  .strict()

// ── PATCH /api/patients/[id]/profile — contact, invoice, tags and consent fields ──
// Validated (E.164 phones, NIF checksum). Changing a reminder consent re-plans this
// patient's upcoming reminders straight away.

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const guard = await requireStaff({ write: true })
  if (!guard.ok) return guard.response
  const { id } = await params
  const parsed = ProfileSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: `${issue?.path.join(".") || "body"}: ${issue?.message ?? "invalid"}` }, { status: 400 })
  }
  const b = parsed.data
  const data: Prisma.PatientUpdateInput = {}
  for (const k of ["phoneNote", "phone2Note", "invoiceName", "invoiceNotes", "referredBy", "clientSource"] as const) {
    if (b[k] !== undefined) data[k] = b[k] || null
  }
  for (const k of ["phone", "phone2"] as const) {
    if (b[k] === undefined) continue
    if (!b[k]) {
      data[k] = null
      continue
    }
    const e164 = toE164(b[k])
    if (!e164) return NextResponse.json({ error: `${k}: not a valid phone number` }, { status: 400 })
    data[k] = e164
  }
  if (b.nif !== undefined) {
    const digits = (b.nif ?? "").replace(/\D/g, "")
    if (digits && !isValidNif(digits)) return NextResponse.json({ error: "nif: invalid NIF (check digit)" }, { status: 400 })
    data.nif = digits || null
  }
  if (b.birthDay !== undefined) data.birthDay = b.birthDay
  if (b.birthMonth !== undefined) data.birthMonth = b.birthMonth
  if (b.tags !== undefined) data.tags = [...new Set(b.tags)]
  if (b.smsRemindersEnabled !== undefined) data.smsRemindersEnabled = b.smsRemindersEnabled
  if (b.emailRemindersEnabled !== undefined) data.emailRemindersEnabled = b.emailRemindersEnabled

  try {
    const before = await prisma.patient.findUnique({ where: { id }, select: { consents: true, smsRemindersEnabled: true, emailRemindersEnabled: true, phone: true, email: true } })
    if (!before) return NextResponse.json({ error: "Patient not found" }, { status: 404 })
    if (b.consents) {
      const merged = { ...((before.consents as Record<string, unknown> | null) ?? {}), ...b.consents, updatedAt: new Date().toISOString() }
      data.consents = merged as Prisma.InputJsonValue
      // The reminder consents and the reminder switches are the same decision.
      if (b.consents.remindersSms !== undefined && b.smsRemindersEnabled === undefined) data.smsRemindersEnabled = b.consents.remindersSms !== false
      if (b.consents.remindersEmail !== undefined && b.emailRemindersEnabled === undefined) data.emailRemindersEnabled = b.consents.remindersEmail !== false
    }
    const patient = await prisma.patient.update({ where: { id }, data })

    // Reminder channels changed → rebuild this patient's pending reminders.
    const channelsChanged =
      patient.smsRemindersEnabled !== before.smsRemindersEnabled || patient.emailRemindersEnabled !== before.emailRemindersEnabled ||
      patient.phone !== before.phone || patient.email !== before.email
    if (channelsChanged) {
      const settings = await getClinicSettings()
      if (settings.flags.reminders) {
        const upcoming = await prisma.appointment.findMany({ where: { patientId: id, startTime: { gt: new Date() }, status: { in: ["SCHEDULED", "CONFIRMED"] } }, select: { id: true, patientId: true, startTime: true } })
        for (const a of upcoming) await prisma.$transaction((tx) => applyPlan(tx, a, patient, { type: "replan" }, settings, new Date()))
      }
    }

    prisma.auditLog
      .create({ data: { userId: guard.user.id, action: "UPDATE", entity: "patient", entityId: id, changes: { fields: Object.keys(data) }, ...requestMeta(req), timestamp: new Date() } })
      .catch(() => {})
    return NextResponse.json(patient)
  } catch (error) {
    console.error("[PATCH /api/patients/[id]/profile]", error)
    return NextResponse.json({ error: "Failed to save" }, { status: 500 })
  }
}

