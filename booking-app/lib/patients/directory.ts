/**
 * Patient directory: search + filters the desk and dentists actually use (who is due a
 * check-up, who never came back, who is missing a date of birth…).
 */
import prisma from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'
import { digitsOnly } from '@/lib/clinic/phone'
import { LOST_AFTER_MONTHS, NEW_WITHIN_DAYS, birthdayOf, clinicalAlerts, lifecycleOf, type Lifecycle } from '@/lib/patients/alerts'

export type DirectoryQuery = {
  q?: string
  lifecycle?: Lifecycle | null
  tag?: string | null
  /** Last visit older than the recall interval and nothing booked. */
  recallDue?: boolean
  upcoming?: 'yes' | 'no' | null
  missing?: 'dob' | 'phone' | 'email' | null
  providerName?: string | null
  sort?: 'name' | 'lastVisit' | 'created'
  page?: number
  limit?: number
}

const ACTIVE = ['SCHEDULED', 'CONFIRMED'] as const

function monthsAgo(n: number, now: Date): Date {
  const d = new Date(now)
  d.setMonth(d.getMonth() - n)
  return d
}

/** The Prisma filter for a directory query. Pure. */
export function directoryWhere(q: DirectoryQuery, opts: { now: Date; recallMonths: number }): Prisma.PatientWhereInput {
  const { now } = opts
  const and: Prisma.PatientWhereInput[] = [{ status: { notIn: ['DRAFT', 'ARCHIVED'] } }]
  const upcomingSome: Prisma.PatientWhereInput = { appointments: { some: { startTime: { gt: now }, status: { in: [...ACTIVE] } } } }
  const upcomingNone: Prisma.PatientWhereInput = { appointments: { none: { startTime: { gt: now }, status: { in: [...ACTIVE] } } } }

  const words = (q.q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 5)
  for (const w of words) {
    const digits = digitsOnly(w)
    and.push({
      OR: [
        { firstName: { contains: w, mode: 'insensitive' } },
        { lastName: { contains: w, mode: 'insensitive' } },
        { email: { contains: w, mode: 'insensitive' } },
        { tags: { has: w.toUpperCase() } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }, { phone2: { contains: digits } }, { nif: { contains: digits } }] : []),
        ...(w.startsWith('zappy:') || /^\d+$/.test(w) ? [{ externalId: `zappy:${w.replace(/^zappy:/, '')}` }] : []),
      ],
    })
  }

  const lostBefore = monthsAgo(LOST_AFTER_MONTHS, now)
  const newSince = new Date(now.getTime() - NEW_WITHIN_DAYS * 86_400_000)
  switch (q.lifecycle) {
    case 'new':
      and.push({ patientSince: { gte: newSince } })
      break
    case 'active':
      and.push({ patientSince: { lt: newSince } }, { OR: [upcomingSome, { lastVisitAt: { gte: lostBefore } }] })
      break
    case 'lost':
      and.push({ patientSince: { lt: newSince } }, upcomingNone, { lastVisitAt: { lt: lostBefore } })
      break
    case 'potential':
      and.push({ patientSince: { lt: newSince } }, upcomingNone, { lastVisitAt: null })
      break
  }
  if (q.tag) and.push({ tags: { has: q.tag } })
  if (q.recallDue) and.push(upcomingNone, { lastVisitAt: { lt: monthsAgo(opts.recallMonths, now) } })
  if (q.upcoming === 'yes') and.push(upcomingSome)
  if (q.upcoming === 'no') and.push(upcomingNone)
  if (q.missing === 'dob') and.push({ dateOfBirth: null })
  if (q.missing === 'phone') and.push({ phone: null, phone2: null })
  if (q.missing === 'email') and.push({ email: null })
  if (q.providerName) and.push({ preferredProvider: { equals: q.providerName, mode: 'insensitive' } })
  return { AND: and }
}

function orderBy(sort: DirectoryQuery['sort']): Prisma.PatientOrderByWithRelationInput[] {
  switch (sort) {
    case 'lastVisit': return [{ lastVisitAt: { sort: 'desc', nulls: 'last' } }, { lastName: 'asc' }]
    case 'created': return [{ patientSince: 'desc' }]
    default: return [{ lastName: 'asc' }, { firstName: 'asc' }]
  }
}

export async function listDirectory(q: DirectoryQuery, opts: { now?: Date; recallMonths: number; timeZone: string }) {
  const now = opts.now ?? new Date()
  const where = directoryWhere(q, { now, recallMonths: opts.recallMonths })
  const limit = Math.min(100, Math.max(1, q.limit ?? 25))
  const page = Math.max(1, q.page ?? 1)
  const [rows, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      orderBy: orderBy(q.sort),
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, firstName: true, lastName: true, phone: true, phone2: true, email: true, nif: true, dateOfBirth: true, birthDay: true, birthMonth: true,
        tags: true, allergies: true, medicalNotes: true, lastVisitAt: true, totalVisits: true, patientSince: true, preferredProvider: true, externalId: true,
        smsRemindersEnabled: true,
        appointments: {
          where: { startTime: { gt: now }, status: { in: [...ACTIVE] } },
          orderBy: { startTime: 'asc' },
          take: 1,
          select: { id: true, startTime: true, type: true, provider: true },
        },
        _count: { select: { appointments: { where: { status: 'NO_SHOW' } } } },
      },
    }),
    prisma.patient.count({ where }),
  ])
  const recallBefore = monthsAgo(opts.recallMonths, now)
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: opts.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const wall = (d: Date) => fmt.format(d).replace(' ', 'T')
  const data = rows.map((p) => {
    const next = p.appointments[0] ?? null
    const bday = birthdayOf(p)
    return {
      id: p.id,
      name: `${p.firstName} ${p.lastName}`.trim(),
      phone: p.phone ?? p.phone2,
      email: p.email,
      nif: p.nif,
      age: p.dateOfBirth ? Math.floor((now.getTime() - p.dateOfBirth.getTime()) / (365.2425 * 86_400_000)) : null,
      dobMissing: !p.dateOfBirth,
      birthday: bday ? `${String(bday.day).padStart(2, '0')}/${String(bday.month).padStart(2, '0')}` : null,
      tags: p.tags,
      alerts: clinicalAlerts(p).map((a) => a.label),
      lastVisitAt: p.lastVisitAt?.toISOString() ?? null,
      totalVisits: p.totalVisits,
      noShows: p._count.appointments,
      nextAppointment: next ? { id: next.id, start: wall(next.startTime), type: next.type, provider: next.provider } : null,
      lifecycle: lifecycleOf({ lastVisitAt: p.lastVisitAt, patientSince: p.patientSince, hasUpcoming: !!next }, now),
      recallDue: !next && !!p.lastVisitAt && p.lastVisitAt < recallBefore,
      smsReminders: p.smsRemindersEnabled,
      fromZappy: !!p.externalId?.startsWith('zappy:'),
    }
  })
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

/** Tags in use, most common first (filter chips). */
export async function tagCounts(limit = 60): Promise<{ tag: string; count: number }[]> {
  const rows = await prisma.$queryRaw<{ tag: string; count: bigint }[]>`
    SELECT t AS tag, COUNT(*)::bigint AS count FROM patients, unnest(tags) AS t
    WHERE status NOT IN ('DRAFT', 'ARCHIVED')
    GROUP BY t ORDER BY COUNT(*) DESC, t ASC LIMIT ${limit}`
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }))
}

/** Counts for the filter chips. */
export async function directoryCounts(opts: { now?: Date; recallMonths: number }) {
  const now = opts.now ?? new Date()
  const count = (q: DirectoryQuery) => prisma.patient.count({ where: directoryWhere(q, { now, recallMonths: opts.recallMonths }) })
  const [all, active, lost, potential, fresh, recall, missingDob, missingPhone] = await Promise.all([
    count({}), count({ lifecycle: 'active' }), count({ lifecycle: 'lost' }), count({ lifecycle: 'potential' }), count({ lifecycle: 'new' }),
    count({ recallDue: true }), count({ missing: 'dob' }), count({ missing: 'phone' }),
  ])
  return { all, active, lost, potential, new: fresh, recallDue: recall, missingDob, missingPhone }
}
