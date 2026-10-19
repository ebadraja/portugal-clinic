"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { FileSpreadsheet, FileText, MoreHorizontal, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddPatientDialog from "@/components/patients/add-patient-dialog";
import { PatientDirectory } from "@/components/patients/PatientDirectory";
import { LegacyPatientsPage } from "@/components/patients/LegacyPatientsPage";
import { ZappyImportDialog } from "@/components/patients/ZappyImportDialog";

export default function PatientsPage() {
  const [tab, setTab] = useState<"all" | "draft">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const isAdmin = useSession().data?.user?.role === "ADMIN";

  return (
    <div className="mx-auto max-w-6xl pt-4 pb-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Patients</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Find a patient, see who is due a check-up, and book them in.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setAddOpen(true)} className="h-10 gap-2 px-4">
            <Plus className="h-4 w-4" />
            New patient
          </Button>
          <div className="relative">
            <Button variant="outline" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} aria-label="More" className="h-10 w-10 p-0">
              <MoreHorizontal className="h-5 w-5" />
            </Button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} aria-hidden />
                <div role="menu" className="absolute right-0 z-40 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  {isAdmin && (
                    <button role="menuitem" onClick={() => { setMoreOpen(false); setImportOpen(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                      <FileSpreadsheet className="h-4 w-4 text-blue-600" /> Import from Zappy
                    </button>
                  )}
                  <button role="menuitem" onClick={() => { setMoreOpen(false); setTab(tab === "draft" ? "all" : "draft"); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                    {tab === "draft" ? <Users className="h-4 w-4 text-slate-500" /> : <FileText className="h-4 w-4 text-slate-500" />}
                    {tab === "draft" ? "Back to patients" : "Draft patients (intake forms)"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {tab === "all" ? (
        <PatientDirectory refreshKey={refreshKey} />
      ) : (
        <div className="space-y-3">
          <button onClick={() => setTab("all")} className="text-sm text-blue-700 hover:underline dark:text-blue-300">← Back to patients</button>
          <LegacyPatientsPage draftsOnly />
        </div>
      )}

      {importOpen && (
        <ZappyImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={() => setRefreshKey((k) => k + 1)} />
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
