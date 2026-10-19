import { PatientRecord } from "@/components/patients/record/PatientRecord"

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const TABS = ["overview", "appointments", "notes", "comms", "details"] as const

// The patient record (components/patients/record). `?tab=` opens a tab; `?edit=1` (old links
// from the list's "Edit" action) opens Details, where every section edits in place.
export default async function PatientPage({ params, searchParams }: Props) {
  const { id } = await params
  const sp = await searchParams
  const tab = typeof sp.tab === "string" && (TABS as readonly string[]).includes(sp.tab) ? (sp.tab as (typeof TABS)[number]) : sp.edit === "1" ? "details" : "overview"
  return <PatientRecord key={id} patientId={id} initialTab={tab} />
}
