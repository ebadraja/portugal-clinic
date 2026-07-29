"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  addDays,
  isToday,
  isSameDay,
  parseISO,
} from "date-fns";
import Link from "next/link";
import {
  Plus, ChevronLeft, ChevronRight, Calendar, Clock,
  User, ExternalLink, Edit2, Ban, RefreshCw, Loader2,
} from "lucide-react";

// ─── Google Calendar event type ───────────────────────────────────────────────

interface GCalEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink: string;
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import AddAppointmentModal from "@/components/add-appointment-modal";
import { AddAppointmentDialog } from "@/components/add-appointment-dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Patient {
  firstName: string;
  lastName: string;
  phone: string | null;
}

interface Appointment {
  id: string;
  patientId: string;
  patient: Patient;
  startTime: string;
  endTime: string;
  duration: number;
  type: string;
  status: string;
  provider: string | null;
  reason: string | null;
  notes: string | null;
}

// ─── Grid constants ───────────────────────────────────────────────────────────

const SLOT_HEIGHT  = 52;   // px per 30-min slot
const DAY_START    = 8;    // 08:00
const DAY_END      = 17;   // 17:00
const PX_PER_MIN   = SLOT_HEIGHT / 30;
const TOTAL_HEIGHT = (DAY_END - DAY_START) * 2 * SLOT_HEIGHT; // 720 px

const TIME_SLOTS: string[] = [];
for (let h = DAY_START; h < DAY_END; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

function slotTop(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h * 60 + m - DAY_START * 60) * PX_PER_MIN;
}

const LUNCH_TOP    = slotTop("12:00");
const LUNCH_HEIGHT = slotTop("13:00") - LUNCH_TOP;

// ─── Collision layout ─────────────────────────────────────────────────────────

function computeLayout(
  items: Array<{ id: string; startMin: number; endMin: number }>,
): Map<string, { col: number; totalCols: number }> {
  if (items.length === 0) return new Map();

  const sorted = [...items].sort((a, b) => a.startMin - b.startMin);
  const result = new Map<string, { col: number; totalCols: number }>();

  const groups: typeof sorted[] = [];
  let current: typeof sorted = [];
  let groupEnd = -Infinity;

  for (const item of sorted) {
    if (item.startMin >= groupEnd && current.length > 0) {
      groups.push(current);
      current = [];
      groupEnd = -Infinity;
    }
    current.push(item);
    groupEnd = Math.max(groupEnd, item.endMin);
  }
  if (current.length > 0) groups.push(current);

  for (const group of groups) {
    const colEnds: number[] = [];
    for (const item of group) {
      let placed = false;
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c] <= item.startMin) {
          colEnds[c] = item.endMin;
          result.set(item.id, { col: c, totalCols: 0 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        colEnds.push(item.endMin);
        result.set(item.id, { col: colEnds.length - 1, totalCols: 0 });
      }
    }
    const numCols = colEnds.length;
    for (const item of group) {
      const r = result.get(item.id)!;
      result.set(item.id, { ...r, totalCols: numCols });
    }
  }

  return result;
}

// ─── Styling maps ─────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { block: string; text: string; dot: string; label: string }> = {
  WELL_CHILD_VISIT: {
    block: "bg-blue-100 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700",
    text:  "text-blue-800 dark:text-blue-200",
    dot:   "bg-blue-500",
    label: "Well-child Visit",
  },
  SICK_VISIT: {
    block: "bg-green-100 dark:bg-green-950/60 border-green-300 dark:border-green-700",
    text:  "text-green-800 dark:text-green-200",
    dot:   "bg-green-500",
    label: "Sick Visit",
  },
  VACCINATION: {
    block: "bg-purple-100 dark:bg-purple-950/60 border-purple-300 dark:border-purple-700",
    text:  "text-purple-800 dark:text-purple-200",
    dot:   "bg-purple-500",
    label: "Vaccination",
  },
  FOLLOW_UP: {
    block: "bg-orange-100 dark:bg-orange-950/60 border-orange-300 dark:border-orange-700",
    text:  "text-orange-800 dark:text-orange-200",
    dot:   "bg-orange-500",
    label: "Follow-up",
  },
  CONSULTATION: {
    block: "bg-teal-100 dark:bg-teal-950/60 border-teal-300 dark:border-teal-700",
    text:  "text-teal-800 dark:text-teal-200",
    dot:   "bg-teal-500",
    label: "Consultation",
  },
  PROCEDURE: {
    block: "bg-rose-100 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700",
    text:  "text-rose-800 dark:text-rose-200",
    dot:   "bg-rose-500",
    label: "Procedure",
  },
  OTHER: {
    block: "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600",
    text:  "text-slate-700 dark:text-slate-300",
    dot:   "bg-slate-400",
    label: "Other",
  },
};

const STATUS_BADGE: Record<string, string> = {
  SCHEDULED:   "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  CONFIRMED:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  COMPLETED:   "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  CANCELLED:   "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  NO_SHOW:     "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  RESCHEDULED: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
};

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(TYPE_CONFIG).map(([k, v]) => [k, v.label])
);

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled", CONFIRMED: "Confirmed", COMPLETED: "Completed",
  CANCELLED: "Cancelled", NO_SHOW: "No-show", RESCHEDULED: "Rescheduled",
};

// ─── AppointmentBlock ─────────────────────────────────────────────────────────

function AppointmentBlock({
  appt,
  onClick,
  col,
  totalCols,
}: {
  appt: Appointment;
  onClick: () => void;
  col: number;
  totalCols: number;
}) {
  const start      = parseISO(appt.startTime);
  const topMin     = start.getHours() * 60 + start.getMinutes() - DAY_START * 60;
  const top        = topMin * PX_PER_MIN;
  const height     = Math.max(appt.duration * PX_PER_MIN, 22);
  const cfg        = TYPE_CONFIG[appt.type] ?? TYPE_CONFIG.OTHER;
  const isCancelled = appt.status === "CANCELLED" || appt.status === "NO_SHOW";
  const isCompleted = appt.status === "COMPLETED";
  const colW       = 100 / totalCols;
  const leftPct    = col * colW;

  if (top < 0 || top >= TOTAL_HEIGHT) return null;
  if (col >= 3) return null;

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        top,
        height,
        position: "absolute",
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${colW}% - 4px)`,
        zIndex: 10,
      }}
      className={`rounded-md shadow-sm px-2 py-0.5 cursor-pointer border transition-all hover:brightness-95 hover:shadow-md select-none overflow-hidden
        ${isCancelled
          ? "bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-50"
          : isCompleted
          ? `${cfg.block} opacity-70`
          : cfg.block}`}
    >
      <p className={`text-[11px] font-semibold leading-tight truncate
        ${isCancelled ? "line-through text-slate-400 dark:text-slate-500" : cfg.text}`}
      >
        {appt.patient.firstName} {appt.patient.lastName}
      </p>
      {height > 32 && (
        <p className={`text-[10px] leading-tight mt-0.5 truncate
          ${isCancelled ? "text-slate-400 dark:text-slate-500" : `${cfg.text} opacity-80`}`}
        >
          {format(start, "h:mm a")}
          {appt.provider && ` · ${appt.provider}`}
        </p>
      )}
    </div>
  );
}

// ─── Google Calendar event typing & parsing ──────────────────────────────────

const GCAL_TYPE_CONFIG = {
  WELL:    { label: "Well Visit",        dot: "bg-blue-500",    block: "bg-blue-50 dark:bg-blue-950/50",       text: "text-blue-800 dark:text-blue-200",       borderColor: "#3b82f6" },
  SICK:    { label: "Sick Visit",        dot: "bg-green-500",   block: "bg-green-50 dark:bg-green-950/50",     text: "text-green-800 dark:text-green-200",     borderColor: "#22c55e" },
  BH:      { label: "Behavioral Health", dot: "bg-fuchsia-500", block: "bg-fuchsia-50 dark:bg-fuchsia-950/50", text: "text-fuchsia-800 dark:text-fuchsia-200", borderColor: "#d946ef" },
  NEW:     { label: "New Patient",       dot: "bg-teal-500",    block: "bg-teal-50 dark:bg-teal-950/50",       text: "text-teal-800 dark:text-teal-200",       borderColor: "#14b8a6" },
  NURSE:   { label: "Nurse Visit",       dot: "bg-orange-500",  block: "bg-orange-50 dark:bg-orange-950/50",   text: "text-orange-800 dark:text-orange-200",   borderColor: "#f97316" },
  VIRTUAL: { label: "Virtual",           dot: "bg-indigo-500",  block: "bg-indigo-50 dark:bg-indigo-950/50",   text: "text-indigo-800 dark:text-indigo-200",   borderColor: "#6366f1" },
  OTHER:   { label: "Other",             dot: "bg-sky-400",     block: "bg-sky-50 dark:bg-sky-950/40",         text: "text-sky-800 dark:text-sky-200",         borderColor: "#38bdf8" },
} as const;

type GcalVisitType = keyof typeof GCAL_TYPE_CONFIG;

interface EnrichedGCalEvent extends GCalEvent {
  visitType: GcalVisitType;
  noShow: boolean;
  cleanTitle: string;
}

function cleanSummary(raw: string): string {
  return raw
    .replace(/\*{1,2}[^*]*\*{1,2}/g, "")
    .replace(/\+[^+]+\+/g, "")
    .replace(/\s*[-–]\s*(BH|WELL|SICK|NEW|GAC|NURSE|MIGDAS|Migdas|VIRTUAL|Virtual Visit|Virtual)\b.*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseGcal(e: GCalEvent): EnrichedGCalEvent {
  const raw = e.summary ?? "";
  let visitType: GcalVisitType = "OTHER";
  if      (/[-–]\s*WELL\b/i.test(raw))  visitType = "WELL";
  else if (/[-–]\s*SICK\b/i.test(raw))  visitType = "SICK";
  else if (/[-–]\s*BH\b/i.test(raw))    visitType = "BH";
  else if (/[-–]\s*NEW\b/i.test(raw))   visitType = "NEW";
  else if (/[-–]\s*NURSE\b/i.test(raw)) visitType = "NURSE";
  else if (/virtual/i.test(raw))        visitType = "VIRTUAL";
  return {
    ...e,
    visitType,
    noShow: /no[\s-]*show/i.test(raw),
    cleanTitle: cleanSummary(raw) || raw,
  };
}

// ─── GCalEventBlock ───────────────────────────────────────────────────────────

function GCalEventBlock({
  event,
  col,
  totalCols,
  onClick,
}: {
  event: EnrichedGCalEvent;
  col: number;
  totalCols: number;
  onClick: () => void;
}) {
  if (event.allDay) return null;

  const start   = new Date(event.start);
  const end     = new Date(event.end);
  const topMin  = start.getHours() * 60 + start.getMinutes() - DAY_START * 60;
  const durMin  = Math.max((end.getTime() - start.getTime()) / 60_000, 15);
  const top     = topMin * PX_PER_MIN;
  const height  = Math.max(durMin * PX_PER_MIN, 18);
  const colW    = 100 / totalCols;
  const leftPct = col * colW;

  if (top < 0 || top >= TOTAL_HEIGHT) return null;
  if (col >= 3) return null;

  const cfg = GCAL_TYPE_CONFIG[event.visitType];

  return (
    <div
      style={{
        top,
        height,
        position: "absolute",
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${colW}% - 4px)`,
        zIndex: 8,
        borderLeft: `3px solid ${event.noShow ? "#94a3b8" : cfg.borderColor}`,
      }}
      className={`rounded-md shadow-sm px-1.5 py-0.5 overflow-hidden cursor-pointer hover:brightness-95 hover:shadow-md transition-all select-none ${
        event.noShow ? "bg-slate-100 dark:bg-slate-800/60 opacity-60" : cfg.block
      }`}
      title={event.summary}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <p className={`text-[10px] font-semibold truncate leading-tight ${
        event.noShow ? "line-through text-slate-500 dark:text-slate-400" : cfg.text
      }`}>
        {event.cleanTitle}
      </p>
      {height > 30 && (
        <p className={`text-[9px] opacity-75 truncate ${
          event.noShow ? "text-slate-400 dark:text-slate-500" : cfg.text
        }`}>
          {format(start, "h:mm a")}
        </p>
      )}
    </div>
  );
}

// ─── GCalEventDetailDialog ────────────────────────────────────────────────────

function GCalEventDetailDialog({
  event,
  onClose,
}: {
  event: EnrichedGCalEvent | null;
  onClose: () => void;
}) {
  if (!event) return null;

  const start  = new Date(event.start);
  const end    = new Date(event.end);
  const durMin = Math.round((end.getTime() - start.getTime()) / 60_000);
  const cfg    = GCAL_TYPE_CONFIG[event.visitType];

  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
            {event.cleanTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {event.noShow && (
            <div className="flex items-center gap-2 text-sm font-medium text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 rounded-lg px-3 py-2">
              <Ban className="h-4 w-4 flex-shrink-0" />
              Marked as no-show
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Date & Time</p>
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {format(start, "EEE, MMM d, yyyy")}
              </p>
              <p className="text-slate-600 dark:text-slate-400">
                {format(start, "h:mm a")} – {format(end, "h:mm a")}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Visit Type</p>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${cfg.block} ${cfg.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </span>
            </div>

            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Duration</p>
              <p className="font-medium text-slate-900 dark:text-slate-100">{durMin} min</p>
            </div>

            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Source</p>
              <p className="font-medium text-slate-900 dark:text-slate-100">Google Calendar</p>
            </div>
          </div>

          {event.summary !== event.cleanTitle && (
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Original event title</p>
              <p className="text-sm text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 break-words">
                {event.summary}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => window.open(event.htmlLink, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in Google Calendar
          </Button>
          <Button size="sm" className="ml-auto" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── AppointmentDetailDialog ──────────────────────────────────────────────────

function AppointmentDetailDialog({
  appt,
  onClose,
  onCancelled,
  onEdit,
}: {
  appt: Appointment | null;
  onClose: () => void;
  onCancelled: () => void;
  onEdit: (appt: Appointment) => void;
}) {
  const [cancelling, setCancelling] = useState(false);

  if (!appt) return null;

  const start = parseISO(appt.startTime);
  const end   = parseISO(appt.endTime);
  const cfg   = TYPE_CONFIG[appt.type] ?? TYPE_CONFIG.OTHER;
  const statusClass = STATUS_BADGE[appt.status] ?? "";
  const isCancellable = !["CANCELLED", "NO_SHOW", "COMPLETED"].includes(appt.status);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/appointments/${appt.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      if (res.ok) {
        onCancelled();
        onClose();
      }
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Dialog open={!!appt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
            {appt.patient.firstName} {appt.patient.lastName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Patient link */}
          <Link
            href={`/patients/${appt.patientId}`}
            className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
            onClick={onClose}
          >
            <User className="h-3.5 w-3.5" />
            View Patient Record
            <ExternalLink className="h-3 w-3" />
          </Link>

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Date & Time</p>
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {format(start, "EEE, MMM d")}
              </p>
              <p className="text-slate-600 dark:text-slate-400">
                {format(start, "h:mm a")} – {format(end, "h:mm a")}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Status</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${statusClass}`}>
                {STATUS_LABEL[appt.status] ?? appt.status}
              </span>
            </div>

            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Type</p>
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {TYPE_LABEL[appt.type] ?? appt.type}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Duration</p>
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {appt.duration} min
              </p>
            </div>

            {appt.provider && (
              <div className="col-span-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Provider</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">{appt.provider}</p>
              </div>
            )}
          </div>

          {appt.reason && (
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Reason for visit</p>
              <p className="text-sm text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
                {appt.reason}
              </p>
            </div>
          )}

          {appt.notes && (
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Notes</p>
              <p className="text-sm text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
                {appt.notes}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 pt-2">
          {isCancellable && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30 gap-1.5"
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
              Cancel
            </Button>
          )}
          {isCancellable && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => { onEdit(appt); onClose(); }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reschedule
            </Button>
          )}
          <Button
            size="sm"
            className="gap-1.5 ml-auto"
            onClick={() => { onEdit(appt); onClose(); }}
          >
            <Edit2 className="h-3.5 w-3.5" />
            Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading]           = useState(true);
  const [currentWeek, setCurrentWeek]   = useState<Date>(() => new Date());
  const [viewMode, setViewMode]         = useState<"day" | "week" | "list">("week");
  const [activeCats, setActiveCats]     = useState<Set<string>>(new Set());
  const [hideNoShows, setHideNoShows]   = useState(false);
  const [selected, setSelected]         = useState<Appointment | null>(null);
  const [selectedGcal, setSelectedGcal] = useState<EnrichedGCalEvent | null>(null);
  const [newApptOpen, setNewApptOpen]   = useState(false);
  const [prefill, setPrefill]           = useState<{ date: string; time: string } | null>(null);
  const [editTarget, setEditTarget]     = useState<Appointment | null>(null);
  const [nowTop, setNowTop]             = useState<number | null>(null);
  const [selectedDay, setSelectedDay]   = useState<Date>(() => new Date());

  // Google Calendar overlay
  const [gcalEvents, setGcalEvents]         = useState<GCalEvent[]>([]);
  const [gcalEnabled, setGcalEnabled]       = useState(false);
  const [gcalConnected, setGcalConnected]   = useState(false);
  const [showGcal, setShowGcal]             = useState(false);
  const [gcalLoading, setGcalLoading]       = useState(false);

  const weekStart = useMemo(() => startOfWeek(currentWeek, { weekStartsOn: 1 }), [currentWeek]);
  const weekEnd   = useMemo(() => endOfWeek(currentWeek, { weekStartsOn: 1 }), [currentWeek]);
  const weekDays  = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({
        startDate: weekStart.toISOString(),
        endDate:   weekEnd.toISOString(),
        limit:     "200",
        page:      "1",
      });

      const res = await fetch(`/api/appointments?${p}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setAppointments(json.data ?? []);
    } catch (err) {
      console.error("[appointments/page] fetch failed", err);
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  // ── Google Calendar ─────────────────────────────────────────────────────────

  // On mount: check if GCal is enabled in settings
  useEffect(() => {
    fetch('/api/settings/google-calendar')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          setGcalConnected(d.connected);
          setGcalEnabled(d.enabled);
          if (d.connected && d.enabled) setShowGcal(true);
        }
      })
      .catch(() => {/* silent */});
  }, []);

  // Fetch GCal events whenever the toggle is on and the week changes
  useEffect(() => {
    if (!showGcal) { setGcalEvents([]); return; }
    setGcalLoading(true);
    const params = new URLSearchParams({
      timeMin: weekStart.toISOString(),
      timeMax: weekEnd.toISOString(),
    });
    fetch(`/api/google-calendar/events?${params}`)
      .then((r) => r.ok ? r.json() : { events: [] })
      .then((d) => setGcalEvents(d.events ?? []))
      .catch(() => setGcalEvents([]))
      .finally(() => setGcalLoading(false));
  }, [showGcal, weekStart, weekEnd]);

  // ── Current-time indicator ──────────────────────────────────────────────────

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const h   = now.getHours();
      const m   = now.getMinutes();
      setNowTop(h >= DAY_START && h < DAY_END
        ? (h * 60 + m - DAY_START * 60) * PX_PER_MIN
        : null);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Enriched GCal events + type filtering ───────────────────────────────────

  const enrichedGcal = useMemo(
    () => gcalEvents.filter((e) => !e.allDay).map(parseGcal),
    [gcalEvents],
  );

  // Legend entries: only types actually present this week, with counts
  const legendEntries = useMemo(() => {
    const entries: Array<{ key: string; label: string; dot: string; count: number }> = [];
    (Object.keys(GCAL_TYPE_CONFIG) as GcalVisitType[]).forEach((t) => {
      const count = enrichedGcal.filter((e) => e.visitType === t).length;
      if (count > 0) entries.push({ key: `g:${t}`, label: GCAL_TYPE_CONFIG[t].label, dot: GCAL_TYPE_CONFIG[t].dot, count });
    });
    Object.entries(TYPE_CONFIG).forEach(([t, cfg]) => {
      const count = appointments.filter((a) => a.type === t).length;
      if (count > 0) entries.push({ key: `c:${t}`, label: cfg.label, dot: cfg.dot, count });
    });
    return entries;
  }, [enrichedGcal, appointments]);

  const toggleCat = useCallback((key: string) => {
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const visibleAppts = useMemo(() => {
    let list = appointments;
    if (hideNoShows)        list = list.filter((a) => a.status !== "CANCELLED" && a.status !== "NO_SHOW");
    if (activeCats.size > 0) list = list.filter((a) => activeCats.has(`c:${a.type}`));
    return list;
  }, [appointments, activeCats, hideNoShows]);

  const visibleGcal = useMemo(() => {
    let list = enrichedGcal;
    if (hideNoShows)        list = list.filter((e) => !e.noShow);
    if (activeCats.size > 0) list = list.filter((e) => activeCats.has(`g:${e.visitType}`));
    return list;
  }, [enrichedGcal, activeCats, hideNoShows]);

  // ── Stats (CRM + Google Calendar combined) ──────────────────────────────────

  const today = useMemo(() => new Date(), []);
  const todayCount = useMemo(
    () =>
      appointments.filter((a) => isSameDay(parseISO(a.startTime), today)).length +
      enrichedGcal.filter((e) => isSameDay(new Date(e.start), today)).length,
    [appointments, enrichedGcal, today],
  );
  const weekTotal = appointments.length + enrichedGcal.length;
  const noShowCount =
    appointments.filter((a) => a.status === "CANCELLED" || a.status === "NO_SHOW").length +
    enrichedGcal.filter((e) => e.noShow).length;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSlotClick = (day: Date, slot: string) => {
    const [h, m] = slot.split(":").map(Number);
    if (h * 60 + m >= 12 * 60 && h * 60 + m < 13 * 60) return; // lunch
    setPrefill({ date: format(day, "yyyy-MM-dd"), time: slot });
    setEditTarget(null);
    setNewApptOpen(true);
  };

  const handleEdit = (appt: Appointment) => {
    setEditTarget(appt);
    setPrefill(null);
    setNewApptOpen(true);
  };

  const handleSaved = () => {
    setNewApptOpen(false);
    setEditTarget(null);
    setPrefill(null);
    fetchAppointments();
  };

  const navigateDay = useCallback((delta: number) => {
    setSelectedDay((d) => {
      const next = addDays(d, delta);
      setCurrentWeek(next);
      return next;
    });
  }, []);

  const editModalData = editTarget
    ? {
        id:               editTarget.id,
        patientName:      `${editTarget.patient.firstName} ${editTarget.patient.lastName}`,
        patientPhone:     editTarget.patient.phone ?? "",
        appointmentDate:  format(parseISO(editTarget.startTime), "yyyy-MM-dd"),
        appointmentTime:  format(parseISO(editTarget.startTime), "HH:mm"),
        appointmentType:  editTarget.type,
        duration:         editTarget.duration,
        provider:         editTarget.provider ?? "",
        reason:           editTarget.reason ?? "",
        notes:            editTarget.notes ?? "",
        status:           editTarget.status,
      }
    : prefill
    ? {
        ...{ patientName: "", patientPhone: "", appointmentType: "WELL_CHILD_VISIT", duration: 30, provider: "Dr. Jonathan Tamas", reason: "", notes: "", status: "SCHEDULED" },
        appointmentDate: prefill.date,
        appointmentTime: prefill.time,
      }
    : undefined;

  // ── Render ───────────────────────────────────────────────────────────────────

  const rangeLabel = viewMode === "day"
    ? format(selectedDay, "EEEE, MMM d, yyyy")
    : `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;

  return (
    <div className="pt-4 pb-8 space-y-5 md:space-y-8">

      {/* ── Page Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">
            Appointments
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
            Manage all patient appointments and schedules
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* View toggle */}
          <div className="hidden sm:flex border border-slate-200 dark:border-slate-700 rounded-lg p-1 bg-slate-50 dark:bg-slate-800">
            {(["day", "week", "list"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  viewMode === v
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-50"
                }`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          {gcalConnected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowGcal((v) => !v)}
              className={`gap-1.5 h-9 text-xs border ${showGcal ? 'border-blue-400 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30' : 'dark:border-slate-600 dark:text-slate-300'}`}
              title={showGcal ? 'Hide Google Calendar events' : 'Show Google Calendar events'}
            >
              {gcalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calendar className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Google Cal</span>
            </Button>
          )}
          <Button
            onClick={() => { setPrefill(null); setEditTarget(null); setNewApptOpen(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2 h-9 md:h-10 text-sm"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden xs:inline">New </span>Appointment
          </Button>
        </div>
      </div>

      {/* ── Sub-header: Navigation ────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="px-2 h-8"
            onClick={() => viewMode === "day" ? navigateDay(-1) : setCurrentWeek((w) => subWeeks(w, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-slate-900 dark:text-slate-50 whitespace-nowrap min-w-[160px] text-center">
            {rangeLabel}
          </span>
          <Button variant="outline" size="sm" className="px-2 h-8"
            onClick={() => viewMode === "day" ? navigateDay(1) : setCurrentWeek((w) => addWeeks(w, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-8"
            onClick={() => { setCurrentWeek(new Date()); setSelectedDay(new Date()); }}
          >
            <Calendar className="h-3.5 w-3.5" />
            Today
          </Button>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {legendEntries.map(({ key, label, dot, count }) => {
            const active = activeCats.has(key);
            return (
              <button
                key={key}
                onClick={() => toggleCat(key)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
                  active
                    ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500"
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                {label}
                <span className={active ? "opacity-70" : "opacity-50"}>{count}</span>
              </button>
            );
          })}
          <button
            onClick={() => setHideNoShows((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
              hideNoShows
                ? "bg-orange-100 dark:bg-orange-950/50 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500"
            }`}
          >
            <Ban className="w-3 h-3" />
            {hideNoShows ? "No-shows hidden" : "Hide no-shows"}
          </button>
          {activeCats.size > 0 && (
            <button
              onClick={() => setActiveCats(new Set())}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline px-1"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Mobile / Tablet list ───────────────────────────────────────────────── */}
      <div className="lg:hidden space-y-4">
        <Card>
          <CardHeader className="pb-3 px-4 py-4">
            <CardTitle className="text-base">This Week's Appointments</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                ))}
              </div>
            ) : (() => {
              type MobileRow = {
                id: string;
                time: Date;
                title: string;
                typeLabel: string;
                sub: string | null;
                dot: string;
                struck: boolean;
                durationLabel: string;
                open: () => void;
              };
              const sections = weekDays
                .map((day) => {
                  const crm  = visibleAppts.filter((a) => isSameDay(parseISO(a.startTime), day));
                  const gcal = showGcal ? visibleGcal.filter((e) => isSameDay(new Date(e.start), day)) : [];
                  const rows: MobileRow[] = [
                    ...crm.map((a): MobileRow => {
                      const cfg = TYPE_CONFIG[a.type] ?? TYPE_CONFIG.OTHER;
                      return {
                        id: `a-${a.id}`,
                        time: parseISO(a.startTime),
                        title: `${a.patient.firstName} ${a.patient.lastName}`,
                        typeLabel: cfg.label,
                        sub: a.provider,
                        dot: cfg.dot,
                        struck: a.status === "CANCELLED" || a.status === "NO_SHOW",
                        durationLabel: `${a.duration} min`,
                        open: () => setSelected(a),
                      };
                    }),
                    ...gcal.map((e): MobileRow => {
                      const cfg = GCAL_TYPE_CONFIG[e.visitType];
                      const durMin = Math.round((new Date(e.end).getTime() - new Date(e.start).getTime()) / 60_000);
                      return {
                        id: `g-${e.id}`,
                        time: new Date(e.start),
                        title: e.cleanTitle,
                        typeLabel: cfg.label,
                        sub: "Google Calendar",
                        dot: e.noShow ? "bg-slate-300 dark:bg-slate-600" : cfg.dot,
                        struck: e.noShow,
                        durationLabel: `${durMin} min`,
                        open: () => setSelectedGcal(e),
                      };
                    }),
                  ].sort((x, y) => x.time.getTime() - y.time.getTime());
                  return { day, rows };
                })
                .filter((s) => s.rows.length > 0);

              if (sections.length === 0) {
                return (
                  <p className="text-sm text-slate-500 text-center py-6">
                    No appointments this week
                  </p>
                );
              }

              return (
                <div className="space-y-5">
                  {sections.map(({ day, rows }) => (
                    <div key={day.toISOString()}>
                      <div className={`flex items-center gap-2 mb-2.5 pb-1.5 border-b ${
                        isToday(day) ? "border-blue-200 dark:border-blue-800" : "border-slate-100 dark:border-slate-800"
                      }`}>
                        <span className={`text-xs font-semibold uppercase tracking-wider ${
                          isToday(day) ? "text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"
                        }`}>
                          {format(day, "EEE, MMM d")}
                        </span>
                        {isToday(day) && (
                          <span className="text-xs bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-medium">
                            Today
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {rows.map((r) => (
                          <div
                            key={r.id}
                            onClick={r.open}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                              r.struck
                                ? "border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 opacity-60"
                                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/30 hover:bg-slate-50 dark:hover:bg-slate-800"
                            }`}
                          >
                            <div className={`w-1.5 h-10 rounded-full flex-shrink-0 ${r.dot}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className={`text-sm font-medium truncate ${
                                  r.struck
                                    ? "line-through text-slate-400 dark:text-slate-600"
                                    : "text-slate-900 dark:text-slate-100"
                                }`}>
                                  {r.title}
                                </p>
                                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded whitespace-nowrap flex-shrink-0">
                                  {format(r.time, "h:mm a")}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                {r.typeLabel} · {r.sub ?? "—"} · {r.durationLabel}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Today",     value: todayCount, color: "text-slate-900 dark:text-slate-50" },
            { label: "This Week", value: weekTotal,  color: "text-slate-900 dark:text-slate-50" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-4 pb-4 px-3 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{s.label}</p>
                <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Desktop: Week Grid + Sidebar ───────────────────────────────────────── */}
      <div className="hidden lg:grid grid-cols-4 gap-6">

        {/* Calendar — 3 cols */}
        <div className="lg:col-span-3">
          {loading && appointments.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 h-96 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : viewMode === "list" ? (
            /* ── List view ── */
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
              {(() => {
                const sections = weekDays
                  .map((day) => {
                    const crm  = visibleAppts.filter((a) => isSameDay(parseISO(a.startTime), day));
                    const gcal = showGcal ? visibleGcal.filter((e) => isSameDay(new Date(e.start), day)) : [];
                    type ListRow = {
                      id: string;
                      time: Date;
                      end: Date;
                      title: string;
                      typeLabel: string;
                      sub: string | null;
                      dot: string;
                      struck: boolean;
                      open: () => void;
                    };
                    const rows: ListRow[] = [
                      ...crm.map((a): ListRow => {
                        const cfg = TYPE_CONFIG[a.type] ?? TYPE_CONFIG.OTHER;
                        return {
                          id: `a-${a.id}`,
                          time: parseISO(a.startTime),
                          end: parseISO(a.endTime),
                          title: `${a.patient.firstName} ${a.patient.lastName}`,
                          typeLabel: cfg.label,
                          sub: a.provider,
                          dot: cfg.dot,
                          struck: a.status === "CANCELLED" || a.status === "NO_SHOW",
                          open: () => setSelected(a),
                        };
                      }),
                      ...gcal.map((e): ListRow => {
                        const cfg = GCAL_TYPE_CONFIG[e.visitType];
                        return {
                          id: `g-${e.id}`,
                          time: new Date(e.start),
                          end: new Date(e.end),
                          title: e.cleanTitle,
                          typeLabel: cfg.label,
                          sub: null,
                          dot: e.noShow ? "bg-slate-300 dark:bg-slate-600" : cfg.dot,
                          struck: e.noShow,
                          open: () => setSelectedGcal(e),
                        };
                      }),
                    ].sort((x, y) => x.time.getTime() - y.time.getTime());
                    return { day, rows };
                  })
                  .filter((s) => s.rows.length > 0);

                if (sections.length === 0) {
                  return (
                    <div className="p-12 text-center">
                      <Calendar className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                      <p className="text-sm text-slate-400 dark:text-slate-500">No appointments this week</p>
                    </div>
                  );
                }

                return sections.map(({ day, rows }) => (
                  <div key={day.toISOString()}>
                    <div className={`flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-700 ${
                      isToday(day) ? "bg-blue-50 dark:bg-blue-950/30" : "bg-slate-50 dark:bg-slate-800/60"
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold uppercase tracking-wider ${
                          isToday(day) ? "text-blue-700 dark:text-blue-300" : "text-slate-600 dark:text-slate-300"
                        }`}>
                          {format(day, "EEEE, MMM d")}
                        </span>
                        {isToday(day) && (
                          <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-semibold">
                            Today
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                        {rows.length} {rows.length === 1 ? "appointment" : "appointments"}
                      </span>
                    </div>
                    {rows.map((r) => (
                      <button
                        key={r.id}
                        onClick={r.open}
                        className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                      >
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 w-[72px] flex-shrink-0">
                          {format(r.time, "h:mm a")}
                        </span>
                        <span className={`w-1.5 h-8 rounded-full flex-shrink-0 ${r.dot}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${
                            r.struck
                              ? "line-through text-slate-400 dark:text-slate-500"
                              : "text-slate-900 dark:text-slate-100"
                          }`}>
                            {r.title}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {r.typeLabel}
                            {r.sub ? ` · ${r.sub}` : ""}
                            {` · ${format(r.time, "h:mm a")} – ${format(r.end, "h:mm a")}`}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                ));
              })()}
            </div>
          ) : viewMode === "day" ? (
            /* ── Day view ── */
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
              {/* Day header */}
              <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <div className="w-16 flex-shrink-0" />
                <div className="flex-1 text-center py-2.5 border-l border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{format(selectedDay, "EEEE")}</p>
                  <div className={`mt-0.5 mx-auto w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold ${
                    isToday(selectedDay) ? "bg-blue-600 text-white" : "text-slate-800 dark:text-slate-100"
                  }`}>
                    {format(selectedDay, "d")}
                  </div>
                </div>
              </div>
              {/* Scrollable body */}
              <div className="overflow-y-auto" style={{ maxHeight: "780px" }}>
                <div className="flex">
                  {/* Time labels */}
                  <div className="w-16 flex-shrink-0 relative" style={{ height: TOTAL_HEIGHT }}>
                    {TIME_SLOTS.map((slot, i) => (
                      <div key={slot} style={{ position: "absolute", top: i * SLOT_HEIGHT, height: SLOT_HEIGHT }} className="w-full flex items-start justify-end pr-2.5">
                        {i % 2 === 0 && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 -mt-2 font-medium">
                            {format(new Date(0, 0, 0, ...slot.split(":").map(Number)), "h a")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Single day column */}
                  {(() => {
                    const dayAppts = visibleAppts.filter((a) => isSameDay(parseISO(a.startTime), selectedDay));
                    const dayGcal  = showGcal ? visibleGcal.filter((e) => isSameDay(new Date(e.start), selectedDay)) : [];
                    const layoutItems = [
                      ...dayAppts.map((a) => { const s = parseISO(a.startTime); const e = parseISO(a.endTime); return { id: `a-${a.id}`, startMin: s.getHours() * 60 + s.getMinutes() - DAY_START * 60, endMin: e.getHours() * 60 + e.getMinutes() - DAY_START * 60 }; }),
                      ...dayGcal.map((e)  => { const s = new Date(e.start); const end = new Date(e.end); return { id: `g-${e.id}`, startMin: s.getHours() * 60 + s.getMinutes() - DAY_START * 60, endMin: end.getHours() * 60 + end.getMinutes() - DAY_START * 60 }; }),
                    ];
                    const layout = computeLayout(layoutItems);
                    return (
                      <div className="flex-1 border-l border-slate-200 dark:border-slate-700 relative" style={{ height: TOTAL_HEIGHT }}>
                        {TIME_SLOTS.map((slot, i) => {
                          const [h, m] = slot.split(":").map(Number);
                          const isLunch = h * 60 + m >= 12 * 60 && h * 60 + m < 13 * 60;
                          return (
                            <div key={slot} onClick={() => !isLunch && handleSlotClick(selectedDay, slot)}
                              style={{ position: "absolute", top: i * SLOT_HEIGHT, height: SLOT_HEIGHT, left: 0, right: 0 }}
                              className={`border-b ${i % 2 === 0 ? "border-slate-100/70 dark:border-slate-800/40" : "border-slate-200 dark:border-slate-700/60"} transition-colors ${isLunch ? "cursor-default" : "cursor-pointer hover:bg-blue-50/30 dark:hover:bg-blue-900/10"}`}
                            />
                          );
                        })}
                        <div style={{ position: "absolute", top: LUNCH_TOP, height: LUNCH_HEIGHT, left: 0, right: 0, zIndex: 5 }}
                          className="bg-slate-50/90 dark:bg-slate-800/80 border-y border-slate-200 dark:border-slate-700 pointer-events-none flex items-center justify-center">
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wide">Lunch</span>
                        </div>
                        {isToday(selectedDay) && nowTop !== null && (
                          <div style={{ position: "absolute", top: nowTop, left: 0, right: 0, zIndex: 20 }} className="flex items-center pointer-events-none">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 flex-shrink-0 shadow-sm" />
                            <div className="flex-1 h-px bg-red-500" />
                          </div>
                        )}
                        {dayAppts.map((appt) => { const lv = layout.get(`a-${appt.id}`) ?? { col: 0, totalCols: 1 }; return <AppointmentBlock key={appt.id} appt={appt} col={lv.col} totalCols={lv.totalCols} onClick={() => setSelected(appt)} />; })}
                        {dayGcal.map((e) => { const lv = layout.get(`g-${e.id}`) ?? { col: 0, totalCols: 1 }; return <GCalEventBlock key={e.id} event={e} col={lv.col} totalCols={lv.totalCols} onClick={() => setSelectedGcal(e)} />; })}
                        {(() => {
                          const hidden =
                            dayAppts.filter((a) => (layout.get(`a-${a.id}`)?.col ?? 0) >= 3).length +
                            dayGcal.filter((e) => (layout.get(`g-${e.id}`)?.col ?? 0) >= 3).length;
                          return hidden > 0 ? (
                            <div style={{ position: "absolute", bottom: 6, right: 4, zIndex: 30 }}
                              className="text-[9px] font-bold bg-slate-500 dark:bg-slate-600 text-white rounded-full px-1.5 py-0.5 pointer-events-none shadow-sm">
                              +{hidden}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : (
            /* ── Week view ── */
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">

              {/* Day-header row */}
              <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <div className="w-16 flex-shrink-0" />
                {weekDays.map((day) => (
                  <div
                    key={day.toISOString()}
                    className="flex-1 min-w-[100px] text-center py-2.5 border-l border-slate-200 dark:border-slate-700"
                  >
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {format(day, "EEE")}
                    </p>
                    <div className={`mt-0.5 mx-auto w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold ${
                      isToday(day) ? "bg-blue-600 text-white" : "text-slate-800 dark:text-slate-100"
                    }`}>
                      {format(day, "d")}
                    </div>
                  </div>
                ))}
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto" style={{ maxHeight: "780px" }}>
                <div className="flex">

                  {/* Time labels */}
                  <div className="w-16 flex-shrink-0 relative" style={{ height: TOTAL_HEIGHT }}>
                    {TIME_SLOTS.map((slot, i) => (
                      <div
                        key={slot}
                        style={{ position: "absolute", top: i * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                        className="w-full flex items-start justify-end pr-2.5"
                      >
                        {i % 2 === 0 && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 -mt-2 font-medium">
                            {format(new Date(0, 0, 0, ...slot.split(":").map(Number)), "h a")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Day columns */}
                  {weekDays.map((day) => {
                    const dayAppts = visibleAppts.filter((a) =>
                      isSameDay(parseISO(a.startTime), day)
                    );
                    const dayGcal = showGcal
                      ? visibleGcal.filter((e) => isSameDay(new Date(e.start), day))
                      : [];
                    const layoutItems = [
                      ...dayAppts.map((a) => {
                        const s = parseISO(a.startTime);
                        const e = parseISO(a.endTime);
                        return { id: `a-${a.id}`, startMin: s.getHours() * 60 + s.getMinutes() - DAY_START * 60, endMin: e.getHours() * 60 + e.getMinutes() - DAY_START * 60 };
                      }),
                      ...dayGcal.map((e) => {
                        const s = new Date(e.start);
                        const end = new Date(e.end);
                        return { id: `g-${e.id}`, startMin: s.getHours() * 60 + s.getMinutes() - DAY_START * 60, endMin: end.getHours() * 60 + end.getMinutes() - DAY_START * 60 };
                      }),
                    ];
                    const layout = computeLayout(layoutItems);

                    return (
                      <div
                        key={day.toISOString()}
                        className={`flex-1 min-w-[100px] border-l border-slate-200 dark:border-slate-700 relative ${
                          isToday(day)
                            ? "bg-blue-50/40 dark:bg-blue-950/10"
                            : day.getDay() === 0 || day.getDay() === 6
                            ? "bg-slate-50/70 dark:bg-slate-800/20"
                            : ""
                        }`}
                        style={{ height: TOTAL_HEIGHT }}
                      >
                        {/* Clickable slot rows */}
                        {TIME_SLOTS.map((slot, i) => {
                          const [h, m] = slot.split(":").map(Number);
                          const isLunch = h * 60 + m >= 12 * 60 && h * 60 + m < 13 * 60;
                          return (
                            <div
                              key={slot}
                              onClick={() => !isLunch && handleSlotClick(day, slot)}
                              style={{
                                position: "absolute",
                                top:      i * SLOT_HEIGHT,
                                height:   SLOT_HEIGHT,
                                left: 0, right: 0,
                              }}
                              className={`border-b ${i % 2 === 0 ? "border-slate-100/70 dark:border-slate-800/40" : "border-slate-200 dark:border-slate-700/60"} transition-colors ${
                                isLunch
                                  ? "cursor-default"
                                  : "cursor-pointer hover:bg-blue-50/30 dark:hover:bg-blue-900/10"
                              }`}
                            />
                          );
                        })}

                        {/* Lunch break overlay (weekdays only) */}
                        {day.getDay() !== 0 && day.getDay() !== 6 && (
                          <div
                            style={{
                              position: "absolute",
                              top:    LUNCH_TOP,
                              height: LUNCH_HEIGHT,
                              left: 0, right: 0,
                              zIndex: 5,
                            }}
                            className="bg-slate-50/90 dark:bg-slate-800/80 border-y border-slate-200 dark:border-slate-700 pointer-events-none flex items-center justify-center"
                          >
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wide">
                              Lunch
                            </span>
                          </div>
                        )}

                        {/* Current-time indicator */}
                        {isToday(day) && nowTop !== null && (
                          <div
                            style={{ position: "absolute", top: nowTop, left: 0, right: 0, zIndex: 20 }}
                            className="flex items-center pointer-events-none"
                          >
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 flex-shrink-0 shadow-sm" />
                            <div className="flex-1 h-px bg-red-500" />
                          </div>
                        )}

                        {/* Appointment blocks */}
                        {dayAppts.map((appt) => {
                          const lv = layout.get(`a-${appt.id}`) ?? { col: 0, totalCols: 1 };
                          return (
                            <AppointmentBlock
                              key={appt.id}
                              appt={appt}
                              col={lv.col}
                              totalCols={lv.totalCols}
                              onClick={() => setSelected(appt)}
                            />
                          );
                        })}

                        {/* Google Calendar events */}
                        {dayGcal.map((e) => {
                          const lv = layout.get(`g-${e.id}`) ?? { col: 0, totalCols: 1 };
                          return <GCalEventBlock key={e.id} event={e} col={lv.col} totalCols={lv.totalCols} onClick={() => setSelectedGcal(e)} />;
                        })}

                        {/* Overflow chip — hidden events beyond 3 columns */}
                        {(() => {
                          const hidden =
                            dayAppts.filter((a) => (layout.get(`a-${a.id}`)?.col ?? 0) >= 3).length +
                            dayGcal.filter((e) => (layout.get(`g-${e.id}`)?.col ?? 0) >= 3).length;
                          return hidden > 0 ? (
                            <div style={{ position: "absolute", bottom: 6, right: 4, zIndex: 30 }}
                              className="text-[9px] font-bold bg-slate-500 dark:bg-slate-600 text-white rounded-full px-1.5 py-0.5 pointer-events-none shadow-sm">
                              +{hidden}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar — 1 col */}
        <div className="space-y-4">

          {/* Stats */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                This Week
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {[
                { label: "Today",              value: todayCount,  icon: Clock },
                { label: "Total",              value: weekTotal,   icon: Calendar },
                { label: "No-show / Cancelled", value: noShowCount, icon: Ban },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </div>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {loading ? "…" : value}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Visit types — interactive legend / filter */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Visit Types
                </CardTitle>
                {activeCats.size > 0 && (
                  <button
                    onClick={() => setActiveCats(new Set())}
                    className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Show all
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">Click a type to filter the calendar</p>
            </CardHeader>
            <CardContent className="px-2 pb-3 space-y-0.5">
              {legendEntries.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-2">
                  No appointments this week
                </p>
              ) : (
                legendEntries.map(({ key, label, dot, count }) => {
                  const active = activeCats.has(key);
                  const dimmed = activeCats.size > 0 && !active;
                  return (
                    <button
                      key={key}
                      onClick={() => toggleCat(key)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors text-left ${
                        active
                          ? "bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-200 dark:ring-blue-800"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800"
                      } ${dimmed ? "opacity-40" : ""}`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
                      <span className="text-xs text-slate-700 dark:text-slate-300 flex-1">{label}</span>
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-1.5 py-0.5">
                        {count}
                      </span>
                    </button>
                  );
                })
              )}
              <div className="pt-2 mt-1 border-t border-slate-100 dark:border-slate-800 px-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-slate-300 dark:bg-slate-600" />
                  <span className="text-xs text-slate-500 dark:text-slate-500">Cancelled / No-show</span>
                </div>
                {gcalConnected && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-2.5 h-2.5 flex-shrink-0 text-slate-400" />
                    <span className="text-xs text-slate-600 dark:text-slate-400">Google Calendar</span>
                    <button
                      onClick={() => setShowGcal((v) => !v)}
                      className={`ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium ${showGcal ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}
                    >
                      {showGcal ? 'On' : 'Off'}
                    </button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Today's upcoming list */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Today's Upcoming
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {loading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />)}
                </div>
              ) : (() => {
                const crmUpcoming = appointments
                  .filter((a) =>
                    isSameDay(parseISO(a.startTime), today) &&
                    !["CANCELLED", "NO_SHOW", "COMPLETED"].includes(a.status)
                  )
                  .sort((a, b) => a.startTime.localeCompare(b.startTime));

                const gcalUpcoming = showGcal
                  ? enrichedGcal
                      .filter((e) => !e.noShow && isSameDay(new Date(e.start), today))
                      .sort((a, b) => a.start.localeCompare(b.start))
                  : [];

                type UpcomingItem =
                  | { kind: "crm"; appt: (typeof crmUpcoming)[0] }
                  | { kind: "gcal"; event: EnrichedGCalEvent };

                const merged: UpcomingItem[] = [
                  ...crmUpcoming.map((appt): UpcomingItem => ({ kind: "crm", appt })),
                  ...gcalUpcoming.map((event): UpcomingItem => ({ kind: "gcal", event })),
                ]
                  .sort((a, b) => {
                    const ta = a.kind === "crm" ? a.appt.startTime : a.event.start;
                    const tb = b.kind === "crm" ? b.appt.startTime : b.event.start;
                    return ta.localeCompare(tb);
                  })
                  .slice(0, 5);

                return merged.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-2">
                    No upcoming appointments
                  </p>
                ) : (
                  <div className="space-y-2">
                    {merged.map((item) => {
                      if (item.kind === "crm") {
                        const cfg = TYPE_CONFIG[item.appt.type] ?? TYPE_CONFIG.OTHER;
                        return (
                          <button
                            key={`crm-${item.appt.id}`}
                            onClick={() => setSelected(item.appt)}
                            className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                          >
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate">
                                {item.appt.patient.firstName} {item.appt.patient.lastName}
                              </p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                {format(parseISO(item.appt.startTime), "h:mm a")} · {cfg.label}
                              </p>
                            </div>
                          </button>
                        );
                      }
                      const gcfg = GCAL_TYPE_CONFIG[item.event.visitType];
                      const gcalEvent = item.event;
                      return (
                        <button
                          key={`gcal-${gcalEvent.id}`}
                          onClick={() => setSelectedGcal(gcalEvent)}
                          className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                        >
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${gcfg.dot}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate">
                              {item.event.cleanTitle}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {format(new Date(item.event.start), "h:mm a")} · {gcfg.label}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Appointment detail dialog ──────────────────────────────────────────── */}
      <AppointmentDetailDialog
        appt={selected}
        onClose={() => setSelected(null)}
        onCancelled={fetchAppointments}
        onEdit={handleEdit}
      />

      {/* ── Google Calendar event detail dialog ───────────────────────────────── */}
      <GCalEventDetailDialog
        event={selectedGcal}
        onClose={() => setSelectedGcal(null)}
      />

      {/* ── New appointment dialog ────────────────────────────────────────────── */}
      {!editTarget && (
        <AddAppointmentDialog
          isOpen={newApptOpen && !editTarget}
          onClose={() => { setNewApptOpen(false); setPrefill(null); }}
          onSuccess={fetchAppointments}
          defaultDate={prefill ? new Date(prefill.date + "T00:00:00") : undefined}
        />
      )}

      {/* ── Edit / Reschedule modal (existing) ────────────────────────────────── */}
      {editTarget && (
        <AddAppointmentModal
          open={newApptOpen && !!editTarget}
          onOpenChange={(o) => {
            if (!o) { setNewApptOpen(false); setEditTarget(null); setPrefill(null); }
          }}
          appointment={editModalData}
          onAppointmentSaved={handleSaved}
        />
      )}
    </div>
  );
}
