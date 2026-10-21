import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { requireStaff } from "@/lib/auth/guards"
import { getClinicSettings } from "@/lib/clinic/settings"
import { norm } from "@/lib/import/zappy"
import { MergeError, mergePatients } from "@/lib/patients/merge"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

const last9 = (p: string | null) => (p ? p.replace(/[^0-9]/g, "").slice(-9) : "")

// ── GET /api/patients/[id]/merge — likely duplicates of this patient ─────────
// Same name (accents and case ignored), same phone, or same NIF.

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const guard = await requireStaff()
  if (!guard.ok) return guard.response
  const { id } = await params
  try {
    const p = await prisma.patient.findUnique({ where: { id }, select: { firstName: true, lastName: true, phone: true, phone2: true, nif: true } })
    if (!p) return NextResponse.json({ error: "Patient not found" }, { status: 404 })
    const name = norm(`${p.firstName} ${p.lastName}`)
    const phones = [last9(p.phone), last9(p.phone2)].filter((x) => x.length === 9)
    // ~7k rows of three short columns: simplest way to compare names without accents.
    const all = await prisma.patient.findMany({ where: { id: { not: id }, status: { not: "ARCHIVED" } }, select: { id: true, firstName: true, lastName: true, phone: true, phone2: true, nif: true } })
    const reasons = new Map<string, string[]>()
    const add = (pid: string, why: string) => reasons.set(pid, [...(reasons.get(pid) ?? []), why])
    for (const o of all) {
      if (name && norm(`${o.firstName} ${o.lastName}`) === name) add(o.id, "same name")
      if (phones.length && [last9(o.phone), last9(o.phone2)].some((x) => x.length === 9 && phones.includes(x))) add(o.id, "same phone")
      if (p.nif && o.nif && o.nif === p.nif) add(o.id, "same NIF")
    }
    const ids = [...reasons.keys()].slice(0, 15)
    const rows = await prisma.patient.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, firstName: true, lastName: true, phone: true, nif: true, dateOfBirth: true, externalId: true, lastVisitAt: true, createdAt: true,
        _count: { select: { appointments: true, notes: true } },
      },
    })
    const candidates = rows
      .map((r) => ({
        id: r.id,
        name: `${r.firstName} ${r.lastName}`.trim(),
        phone: r.phone,
        nif: r.nif,
        dateOfBirth: r.dateOfBirth?.toISOString().slice(0, 10) ?? null,
        zappyNumber: r.externalId && /^zappy:\d+$/.test(r.externalId) ? r.externalId.slice(6) : null,
        fromBooking: !!r.externalId?.startsWith("zappy:n:"),
        lastVisitAt: r.lastVisitAt?.toISOString() ?? null,
        appointments: r._count.appointments,
        notes: r._count.notes,
        reasons: reasons.get(r.id) ?? [],
      }))
      .sort((a, b) => Number(a.fromBooking) - Number(b.fromBooking) || b.appointments - a.appointments)
    return NextResponse.json({ candidates })
  } catch (error) {
    console.error("[GET /api/patients/[id]/merge]", error)
    return NextResponse.json({ error: "Failed to look for duplicates" }, { status: 500 })
  }
}

const MergeSchema = z.object({ intoId: z.string().min(1).max(60) })

// ── POST /api/patients/[id]/merge { intoId } — move this record into another, then delete it ──

export async function POST(req: NextRequest, { params }: RouteContext) {
  const guard = await requireStaff({ admin: true })
  if (!guard.ok) return guard.response
  const { id } = await params
  const parsed = MergeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Choose the patient to merge into" }, { status: 400 })
  try {
    const summary = await mergePatients(id, parsed.data.intoId, { userId: guard.user.id, timeZone: (await getClinicSettings()).timezone })
    return NextResponse.json({ intoId: parsed.data.intoId, ...summary })
  } catch (error) {
    if (error instanceof MergeError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("[POST /api/patients/[id]/merge]", error)
    return NextResponse.json({ error: "The merge failed — nothing was changed." }, { status: 500 })
  }
}
