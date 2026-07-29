"use client";

import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Upload,
  AlertCircle,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

interface CSVImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: (results: ImportResult) => void;
}

interface CSVRow {
  [key: string]: string;
}

interface ValidationError {
  row: number;
  field: string;
  value: string;
  error: string;
}

interface ImportResult {
  successful: number;
  failed: number;
  created: number;
  updated: number;
  errors: ValidationError[];
  warnings: string[];
}

const DEVELO_REQUIRED_HEADER = "OriginatorPatientID";

const PREVIEW_COLUMNS = [
  "OriginatorPatientID",
  "FirstName",
  "LastName",
  "DoB",
  "PatientCellNumber",
  "Caregiver1FirstName",
] as const;

/** Minimal CSV parser (quoted fields, commas). No papaparse dependency. */
function parseCsv(text: string): { headers: string[]; rows: CSVRow[] } {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      if (current.length > 0 || lines.length > 0) lines.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.length > 0) lines.push(current);

  if (lines.length === 0) return { headers: [], rows: [] };

  const splitLine = (line: string): string[] => {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1];
      if (ch === '"') {
        if (quoted && next === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
        continue;
      }
      if (ch === "," && !quoted) {
        cells.push(cell.trim());
        cell = "";
        continue;
      }
      cell += ch;
    }
    cells.push(cell.trim());
    return cells;
  };

  const headers = splitLine(lines[0]).map((h) => h.replace(/^"|"$/g, "").trim());
  const rows: CSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = splitLine(lines[i]).map((v) => v.replace(/^"|"$/g, "").trim());
    const row: CSVRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

export default function CSVImportModal({
  open,
  onOpenChange,
  onImportComplete,
}: CSVImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "complete">(
    "upload"
  );
  const [csvData, setCSVData] = useState<CSVRow[]>([]);
  const [csvColumns, setCSVColumns] = useState<string[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [importError, setImportError] = useState("");

  const handleFileSelect = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Please select a CSV file");
      return;
    }

    setFileName(file.name);
    setImportError("");
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const csv = event.target?.result as string;
        const { headers, rows } = parseCsv(csv);

        if (headers.length === 0 || rows.length === 0) {
          alert("CSV file must contain at least a header row and one data row");
          return;
        }

        if (!headers.includes(DEVELO_REQUIRED_HEADER)) {
          alert(
            `This importer expects a Develo demographics export with an "${DEVELO_REQUIRED_HEADER}" column.`
          );
          return;
        }

        setCSVColumns(headers);
        setCSVData(rows);
        setStep("preview");
      } catch (error) {
        alert(`Error parsing CSV: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    };

    reader.readAsText(file);
  };

  const handleImport = async () => {
    setStep("importing");
    setImportProgress(10);
    setImportError("");

    try {
      setImportProgress(40);
      const res = await fetch("/api/patients/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: csvData }),
      });

      setImportProgress(80);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Import failed");
      }

      const created = Number(data.created ?? 0);
      const updated = Number(data.updated ?? 0);
      const apiErrors: Array<{ row: number; externalId?: string; reason: string }> =
        Array.isArray(data.errors) ? data.errors : [];

      const result: ImportResult = {
        successful: created + updated,
        failed: apiErrors.length,
        created,
        updated,
        errors: apiErrors.map((e) => ({
          row: e.row,
          field: e.externalId ?? "row",
          value: e.externalId ?? "",
          error: e.reason,
        })),
        warnings: [
          `Imported from file: ${fileName}`,
          `${created} created, ${updated} updated`,
        ],
      };

      setImportProgress(100);
      setImportResult(result);
      setStep("complete");
      onImportComplete?.(result);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed");
      setStep("preview");
      setImportProgress(0);
    }
  };

  const handleReset = () => {
    setStep("upload");
    setCSVData([]);
    setCSVColumns([]);
    setImportProgress(0);
    setImportResult(null);
    setFileName("");
    setImportError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  const previewHeaders = PREVIEW_COLUMNS.filter((col) => csvColumns.includes(col));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && "Import Patients from CSV"}
            {step === "preview" && "Preview Develo Export"}
            {step === "importing" && "Importing Patients..."}
            {step === "complete" && "Import Complete"}
          </DialogTitle>
          <DialogDescription>
            {step === "upload" &&
              "Upload a Develo demographics CSV to bulk import / update patient records"}
            {step === "preview" &&
              `${csvData.length} row${csvData.length !== 1 ? "s" : ""} ready to import (upsert by OriginatorPatientID)`}
            {step === "importing" && "Processing your patient records..."}
            {step === "complete" &&
              `${importResult?.successful || 0} patient${(importResult?.successful || 0) !== 1 ? "s" : ""} imported successfully`}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <p className="font-medium text-slate-900 mb-1">
                Click to upload or drag and drop
              </p>
              <p className="text-sm text-slate-500">CSV files only (max 10MB)</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">Develo export expected</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Must include OriginatorPatientID (used for upsert / dedupe)</li>
                <li>• Required per row: FirstName, LastName, DoB (MM/DD/YYYY)</li>
                <li>• Caregiver1 / Caregiver2 and demographics columns are imported when present</li>
                <li>• SSN, insurance, and other unused Develo columns are ignored</li>
              </ul>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            {importError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-2">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{importError}</p>
              </div>
            )}

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <p className="text-sm text-emerald-800">
                Develo headers detected. Existing patients with the same OriginatorPatientID will be
                updated; new IDs will be created.
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Empty cells do not overwrite existing CRM values on update.
              </p>
            </div>

            <div className="bg-slate-50 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">
                        Row
                      </th>
                      {previewHeaders.map((header) => (
                        <th
                          key={header}
                          className="px-4 py-2 text-left text-xs font-semibold text-slate-700 whitespace-nowrap"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="border-b border-slate-200 hover:bg-white/50">
                        <td className="px-4 py-2 text-slate-600">{idx + 2}</td>
                        {previewHeaders.map((header) => (
                          <td
                            key={header}
                            className="px-4 py-2 text-slate-900 truncate max-w-xs"
                          >
                            {row[header] || ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {csvData.length > 5 && (
                <div className="px-4 py-3 bg-slate-100 text-sm text-slate-600 border-t border-slate-200">
                  Showing 5 of {csvData.length} rows
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={handleReset}>
                Cancel
              </Button>
              <Button onClick={() => void handleImport()} className="gap-2">
                Import {csvData.length} Patient
                {csvData.length !== 1 ? "s" : ""}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">
                  Importing records...
                </span>
                <span className="text-sm text-slate-500">{Math.round(importProgress)}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
            </div>

            <div className="text-center">
              <div className="inline-block">
                <div className="animate-spin">
                  <Upload className="h-8 w-8 text-blue-500" />
                </div>
              </div>
              <p className="text-slate-600 mt-3 text-sm">
                Processing {csvData.length} patient records...
              </p>
            </div>
          </div>
        )}

        {step === "complete" && importResult && (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                <h3 className="font-semibold text-emerald-900">
                  Import finished
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <p className="text-xs text-slate-600 mb-1">Created</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {importResult.created}
                </p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <p className="text-xs text-slate-600 mb-1">Updated</p>
                <p className="text-2xl font-bold text-blue-600">
                  {importResult.updated}
                </p>
              </div>
              {importResult.failed > 0 && (
                <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                  <p className="text-xs text-red-600 mb-1">Failed</p>
                  <p className="text-2xl font-bold text-red-600">
                    {importResult.failed}
                  </p>
                </div>
              )}
            </div>

            {importResult.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-medium text-red-900 mb-2">Errors:</h4>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {importResult.errors.map((error, idx) => (
                    <div key={idx} className="text-xs text-red-800">
                      Row {error.row}
                      {error.value ? ` (${error.value})` : ""}: {error.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                Patient records are now available in the CRM. Re-uploading the same
                OriginatorPatientID updates the existing record.
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={handleReset} className="gap-2">
                Import Another File
              </Button>
              <Button onClick={handleClose} className="gap-2">
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
