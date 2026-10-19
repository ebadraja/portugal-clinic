import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { getClinicSettings, providerById, providerByName } from "@/lib/clinic/settings"
import { PrintButton } from "./PrintButton"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Declaração de presença", robots: { index: false } }

type Props = { params: Promise<{ id: string }> }

// Attendance certificate ("declaração de presença") for the patient's employer or school.
// Patient-facing document, so it is in Portuguese regardless of the staff UI language.
export default async function CertificatePage({ params }: Props) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  const { id } = await params
  const appt = await prisma.appointment.findUnique({
    where: { id },
    select: {
      id: true, startTime: true, endTime: true, checkedInAt: true, status: true, provider: true, providerId: true,
      patient: { select: { firstName: true, lastName: true, nif: true } },
    },
  })
  if (!appt) notFound()
  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "READ", entity: "appointment", entityId: id, changes: { document: "attendance_certificate" }, timestamp: new Date() },
  })

  const s = await getClinicSettings()
  const tz = s.timezone
  const from = appt.checkedInAt && appt.checkedInAt < appt.startTime ? appt.checkedInAt : appt.startTime
  const day = new Intl.DateTimeFormat("pt-PT", { timeZone: tz, day: "numeric", month: "long", year: "numeric" }).format(appt.startTime)
  const t = (d: Date) => new Intl.DateTimeFormat("pt-PT", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d)
  const today = new Intl.DateTimeFormat("pt-PT", { timeZone: tz, day: "numeric", month: "long", year: "numeric" }).format(new Date())
  const provider = providerById(appt.providerId, s.providers) ?? providerByName(appt.provider, s.providers)
  const town = s.practice.address.split(",").pop()?.trim() || ""
  const name = `${appt.patient.firstName} ${appt.patient.lastName}`.trim()

  return (
    <div lang="pt-PT" className="mx-auto w-full max-w-[720px] bg-white px-10 py-12 text-[15px] leading-relaxed text-slate-900 print:px-0 print:py-0">
      <div className="mb-8 flex justify-end print:hidden">
        <PrintButton />
      </div>
      <header className="mb-10 border-b border-slate-200 pb-4">
        <p className="text-lg font-semibold">{s.identity.legalName || s.practice.name}</p>
        <p className="text-sm text-slate-600">{s.practice.address}</p>
        <p className="text-sm text-slate-600">
          Tel. {s.practice.phone}{s.practice.email ? ` · ${s.practice.email}` : ""}
          {s.identity.nif ? ` · NIF ${s.identity.nif}` : ""}{s.identity.ersNumber ? ` · ERS ${s.identity.ersNumber}` : ""}
        </p>
      </header>

      <h1 className="mb-8 text-center text-xl font-bold tracking-wide">DECLARAÇÃO DE PRESENÇA</h1>

      <p className="mb-6 text-justify">
        Declara-se, para os devidos efeitos, que <strong>{name}</strong>
        {appt.patient.nif ? <>, contribuinte n.º {appt.patient.nif},</> : ","} esteve presente nesta clínica no dia <strong>{day}</strong>,
        entre as <strong>{t(from)}</strong> e as <strong>{t(appt.endTime)}</strong>, para consulta de medicina dentária.
      </p>
      <p className="mb-16">Por ser verdade, passa-se a presente declaração.</p>

      <p className="mb-16">{town ? `${town}, ` : ""}{today}</p>

      <div className="w-72 border-t border-slate-400 pt-2 text-sm">
        <p className="font-medium">{provider?.name ?? appt.provider ?? s.practice.name}</p>
        {provider?.title && <p className="text-slate-600">{provider.title}</p>}
        {provider?.registrationNumber && <p className="text-slate-600">OMD n.º {provider.registrationNumber}</p>}
      </div>
    </div>
  )
}
