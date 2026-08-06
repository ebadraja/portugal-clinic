import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import prisma from '@/lib/prisma'
import type { Gender, PatientStatus, Prisma } from '@/lib/generated/prisma/client'

export const dynamic = 'force-dynamic'

type DeveloRow = Record<string, string | undefined>

type RowError = {
  row: number
  externalId?: string
  reason: string
}

function cell(row: DeveloRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function joinParts(parts: Array<string | undefined>, separator: string): string {
  return parts
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
    .join(separator)
}

/** Parse Develo DoB as MM/DD/YYYY. Returns null if invalid. */
function parseDeveloDate(raw: string): Date | null {
  const trimmed = raw.trim()
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  const month = Number(match[1])
  const day = Number(match[2])
  const year = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
    return null
  }
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

function mapGender(sex: string): Gender | undefined {
  const normalized = sex.trim().toUpperCase()
  if (normalized === 'MALE') return 'MALE'
  if (normalized === 'FEMALE') return 'FEMALE'
  return undefined
}

function mapStatus(status: string): PatientStatus | undefined {
  if (status.trim().toLowerCase() === 'active') return 'ACTIVE'
  return undefined
}

/** Only include fields with non-empty values so blanks never wipe existing data. */
function setIfPresent(
  data: Prisma.PatientUpdateInput | Prisma.PatientCreateInput,
  key: keyof Prisma.PatientCreateInput,
  value: string | Date | Gender | PatientStatus | undefined | null,
) {
  if (value === undefined || value === null) return
  if (typeof value === 'string' && !value.trim()) return
  ;(data as Record<string, unknown>)[key] = typeof value === 'string' ? value.trim() : value
}

function mapRowToPatientData(row: DeveloRow): {
  ok: true
  externalId: string
  create: Prisma.PatientCreateInput
  update: Prisma.PatientUpdateInput
} | { ok: false; reason: string; externalId?: string } {
  const externalId = cell(row, 'OriginatorPatientID')
  if (!externalId) {
    return { ok: false, reason: 'Missing OriginatorPatientID' }
  }

  const firstName = cell(row, 'FirstName')
  if (!firstName) {
    return { ok: false, reason: 'Missing FirstName', externalId }
  }

  const lastName = cell(row, 'LastName')
  if (!lastName) {
    return { ok: false, reason: 'Missing LastName', externalId }
  }

  const dobRaw = cell(row, 'DoB')
  if (!dobRaw) {
    return { ok: false, reason: 'Missing DoB', externalId }
  }
  const dateOfBirth = parseDeveloDate(dobRaw)
  if (!dateOfBirth) {
    return { ok: false, reason: `Invalid DoB (expected MM/DD/YYYY): ${dobRaw}`, externalId }
  }

  const phone = cell(row, 'PatientCellNumber') || cell(row, 'PrimaryPhone')
  const address = joinParts([cell(row, 'Address1'), cell(row, 'Address2')], ', ')
  const parentName = joinParts(
    [cell(row, 'Caregiver1FirstName'), cell(row, 'Caregiver1LastName')],
    ' ',
  )
  const parent2Name = joinParts(
    [cell(row, 'Caregiver2FirstName'), cell(row, 'Caregiver2LastName')],
    ' ',
  )
  const gender = mapGender(cell(row, 'Sex'))
  const status = mapStatus(cell(row, 'PatientStatus'))

  const create: Prisma.PatientCreateInput = {
    externalId,
    firstName,
    lastName,
    dateOfBirth,
  }

  const update: Prisma.PatientUpdateInput = {
    firstName,
    lastName,
    dateOfBirth,
  }

  const optional: Array<[keyof Prisma.PatientCreateInput, string | Gender | PatientStatus | undefined]> = [
    ['middleName', cell(row, 'MiddleName')],
    ['gender', gender],
    ['phone', phone],
    ['email', cell(row, 'Email')],
    ['address', address],
    ['city', cell(row, 'City')],
    ['state', cell(row, 'State')],
    ['zipCode', cell(row, 'ZipCode')],
    ['preferredLanguage', cell(row, 'PrimaryLanguage')],
    ['secondaryLanguage', cell(row, 'SecondaryLanguage')],
    ['preferredProvider', cell(row, 'PrimaryProvider')],
    ['status', status],
    ['membershipStatus', cell(row, 'MembershipStatus')],
    ['raceEthnicity', cell(row, 'RaceEthnicityDesc')],
    ['parentName', parentName],
    ['parentRelation', cell(row, 'Caregiver1RelationshipToPatient')],
    ['parentPhone', cell(row, 'Caregiver1Mobile')],
    ['parentEmail', cell(row, 'Caregiver1Email')],
    ['parent2Name', parent2Name],
    ['parent2Relation', cell(row, 'Caregiver2RelationshipToPatient')],
    ['parentPhone2', cell(row, 'Caregiver2Mobile')],
    ['parent2Email', cell(row, 'Caregiver2Email')],
  ]

  for (const [key, value] of optional) {
    setIfPresent(create, key, value)
    setIfPresent(update, key, value)
  }

  return { ok: true, externalId, create, update }
}

export async function POST(request: NextRequest) {
  try {
    // Match staff session pattern used by other patient API routes (auth()).
    // Note: POST /api/patients itself currently has no auth guard.
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const rows = body?.rows

    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: 'Body must include rows: DeveloRow[]' }, { status: 400 })
    }

    let created = 0
    let updated = 0
    const errors: RowError[] = []

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2 // header is row 1
      const row = (rows[i] ?? {}) as DeveloRow

      try {
        const mapped = mapRowToPatientData(row)
        if (!mapped.ok) {
          errors.push({
            row: rowNumber,
            externalId: mapped.externalId,
            reason: mapped.reason,
          })
          continue
        }

        const existing = await prisma.patient.findUnique({
          where: { externalId: mapped.externalId },
          select: { id: true },
        })

        if (existing) {
          await prisma.patient.update({
            where: { externalId: mapped.externalId },
            data: mapped.update,
          })
          updated += 1
        } else {
          await prisma.patient.create({
            data: {
              ...mapped.create,
              createdBy: { connect: { id: session.user.id } },
            },
          })
          created += 1
        }
      } catch (err) {
        errors.push({
          row: rowNumber,
          externalId: cell(row, 'OriginatorPatientID') || undefined,
          reason: err instanceof Error ? err.message : 'Failed to import row',
        })
      }
    }

    return NextResponse.json({ created, updated, errors })
  } catch (error) {
    console.error('[POST /api/patients/bulk-import]', error)
    return NextResponse.json({ error: 'Failed to import patients' }, { status: 500 })
  }
}
