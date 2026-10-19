"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { FileSpreadsheet, FileText, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddPatientDialog from "@/components/patients/add-patient-dialog";
import { PatientDirectory } from "@/components/patients/PatientDirectory";
import { LegacyPatientsPage } from "@/components/patients/LegacyPatientsPage";
import { ZappyImportDialog } from "@/components/patients/ZappyImportDialog";

export default function PatientsPage() {
  const [tab, setTab] = useState<"all" | "draft">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const isAdmin = useSession().data?.user?.role === "ADMIN";

  return (
    <div className="pt-4 pb-8 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Patients</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">Find anyone, see who is due a check-up, and book them straight into the agenda.</p>
        </div>
        {isAdmin && (
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Import from Zappy
          </Button>
        )}
      </div>

      <div role="tablist" aria-label="Patient views" className="flex gap-1 border-b border-border">
        {([
          { id: "all", label: "All patients", icon: Users },
          { id: "draft", label: "Draft patients (intake forms)", icon: FileText },
        ] as const).map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${tab === t.id ? "border-blue-600 text-blue-700 dark:text-blue-300" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}
          >
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === "all" ? <PatientDirectory onAddPatient={() => setAddOpen(true)} refreshKey={refreshKey} /> : <LegacyPatientsPage draftsOnly />}

      {importOpen && (
        <ZappyImportDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={() => setRefreshKey((k) => k + 1)}
        />
      )}

      <AddPatientDialog
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={() => {
          setAddOpen(false);
          setRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}
