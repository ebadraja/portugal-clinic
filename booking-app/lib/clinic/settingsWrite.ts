import { z } from 'zod'
import prisma from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'
import {
  AppointmentTypesSchema,
  BookingPolicySchema,
  BusinessHoursSchema,
  ClinicIdentitySchema,
  HolidaysSchema,
  InsurersSchema,
  LunchBreakSchema,
  ProvidersSchema,
  isValidTimeZone,
} from '@/lib/clinic/settings'

/** Every section is optional; only sections present are written. */
export const ClinicSettingsPatchSchema = z
  .object({
    practice: z
      .object({
        name: z.string().trim().min(1).max(120),
        tagline: z.string().trim().max(160),
        phone: z.string().trim().max(30),
        email: z.union([z.literal(''), z.string().trim().email().max(120)]),
        address: z.string().trim().max(200),
        website: z.union([z.literal(''), z.string().trim().url().max(200)]),
      })
      .partial(),
    timezone: z.string().refine(isValidTimeZone, 'Unknown timezone'),
    locale: z.enum(['pt-PT', 'en-GB', 'es-ES']),
    identity: ClinicIdentitySchema,
    businessHours: BusinessHoursSchema,
    lunchBreak: LunchBreakSchema,
    holidays: HolidaysSchema,
    bookingPolicy: BookingPolicySchema,
    providers: ProvidersSchema,
    insurers: InsurersSchema,
    appointmentTypes: AppointmentTypesSchema.refine((rows) => rows.some((r) => r.active), { message: 'Keep at least one active appointment type' }),
  })
  .partial()
  .strict()

export type ClinicSettingsPatch = z.infer<typeof ClinicSettingsPatchSchema>

/** Maps a validated patch to Settings columns. Pure. */
export function toSettingsData(patch: ClinicSettingsPatch): Prisma.SettingsUpdateInput {
  const d: Prisma.SettingsUpdateInput = {}
  const p = patch.practice
  if (p) {
    if (p.name !== undefined) d.practiceName = p.name
    if (p.tagline !== undefined) d.practiceTagline = p.tagline || null
    if (p.phone !== undefined) d.practicePhone = p.phone || null
    if (p.email !== undefined) d.practiceEmail = p.email || null
    if (p.address !== undefined) d.practiceAddress = p.address || null
    if (p.website !== undefined) d.practiceWebsite = p.website || null
  }
  if (patch.timezone !== undefined) d.timezone = patch.timezone
  if (patch.locale !== undefined) d.locale = patch.locale
  if (patch.identity !== undefined) d.clinicIdentity = patch.identity
  if (patch.businessHours !== undefined) d.businessHours = patch.businessHours
  if (patch.lunchBreak !== undefined) d.lunchBreak = patch.lunchBreak
  if (patch.holidays !== undefined) d.holidays = patch.holidays
  if (patch.bookingPolicy !== undefined) d.bookingPolicy = patch.bookingPolicy
  if (patch.providers !== undefined) d.providers = patch.providers
  if (patch.insurers !== undefined) d.insurers = patch.insurers
  if (patch.appointmentTypes !== undefined) d.appointmentTypes = patch.appointmentTypes
  return d
}

/** The singleton row, created with defaults if the database has none yet. */
export async function ensureSettingsRow(): Promise<{ id: string }> {
  const existing = await prisma.settings.findFirst({ select: { id: true } })
  if (existing) return existing
  return prisma.settings.create({ data: {}, select: { id: true } })
}

/** Writes a Settings update and an audit entry with before/after of the changed columns. */
export async function updateSettingsAudited(input: {
  data: Prisma.SettingsUpdateInput
  userId: string
  section: string
  ipAddress?: string | null
  userAgent?: string | null
}): Promise<void> {
  const { id } = await ensureSettingsRow()
  const keys = Object.keys(input.data)
  if (keys.length === 0) return
  const before = await prisma.settings.findUnique({ where: { id } })
  await prisma.settings.update({ where: { id }, data: input.data })
  const pick = (row: Record<string, unknown> | null) => Object.fromEntries(keys.map((k) => [k, row?.[k] ?? null]))
  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: 'UPDATE',
      entity: 'settings',
      entityId: id,
      changes: JSON.parse(JSON.stringify({ section: input.section, before: pick(before as Record<string, unknown> | null), after: pick(input.data as Record<string, unknown>) })),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      timestamp: new Date(),
    },
  })
}
