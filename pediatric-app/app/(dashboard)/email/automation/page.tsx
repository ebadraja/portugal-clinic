"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Zap, Plus, X, AlertCircle, Loader2, Clock, CalendarPlus,
  CalendarCheck, CalendarX, UserPlus, Send, Filter, Pencil,
  Trash2, ChevronDown, CheckCircle2, BrainCircuit, Link2,
  Bell, AlarmClock, ClipboardList, Heart, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type TriggerEvent =
  | "APPOINTMENT_CREATED"
  | "APPOINTMENT_UPDATED"
  | "APPOINTMENT_CANCELLED"
  | "X_DAYS_BEFORE"
  | "X_DAYS_AFTER"
  | "PATIENT_CREATED";

type ConditionType = "visitType" | "ageRange" | "doctor" | "patientType";

interface Condition {
  id: string;
  type: ConditionType;
  visitType?: string;
  ageMin?: number;
  ageMax?: number;
  doctor?: string;
  patientType?: string;
}

interface AutomationRule {
  id: string;
  name: string;
  isActive: boolean;
  triggerEvent: TriggerEvent;
  triggerOffsetHours: number | null;
  conditions: Condition[] | null;
  templateId: string;
  template: { id: string; name: string; type: string };
  createdAt: string;
  updatedAt: string;
}

interface Template {
  id: string;
  name: string;
  type: string;
  subject: string;
  isActive: boolean;
}

interface Suggestion {
  id: string;
  icon: React.ElementType;
  gradient: string;
  name: string;
  description: string;
  triggerEvent: TriggerEvent;
  triggerOffsetHours: number | null;
  conditions: Omit<Condition, "id">[];
  defaultName: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const VISIT_LABELS: Record<string, string> = {
  WELL_CHILD_VISIT:    "Well Child Check",
  SICK_VISIT:          "Sick Visit",
  DEVELOPMENTAL:       "Developmental",
  AUTISM_ASSESSMENT:   "Autism Assessment",
};

const TRIGGER_META: Record<TriggerEvent, { color: string; bg: string; darkBg: string; border: string; icon: React.ElementType }> = {
  APPOINTMENT_CREATED:   { color: "text-blue-600",   bg: "bg-blue-50",   darkBg: "dark:bg-blue-950/40",  border: "border-blue-400",   icon: CalendarPlus  },
  APPOINTMENT_UPDATED:   { color: "text-slate-600",  bg: "bg-slate-100", darkBg: "dark:bg-slate-800",    border: "border-slate-400",  icon: CalendarCheck },
  APPOINTMENT_CANCELLED: { color: "text-red-600",    bg: "bg-red-50",    darkBg: "dark:bg-red-950/40",   border: "border-red-400",    icon: CalendarX     },
  X_DAYS_BEFORE:         { color: "text-amber-600",  bg: "bg-amber-50",  darkBg: "dark:bg-amber-950/30", border: "border-amber-400",  icon: Clock         },
  X_DAYS_AFTER:          { color: "text-green-600",  bg: "bg-green-50",  darkBg: "dark:bg-green-950/30", border: "border-green-400",  icon: CheckCircle2  },
  PATIENT_CREATED:       { color: "text-purple-600", bg: "bg-purple-50", darkBg: "dark:bg-purple-950/30",border: "border-purple-400", icon: UserPlus      },
};

const SUGGESTIONS: Suggestion[] = [
  {
    id: "develo-ehr",
    icon: Link2,
    gradient: "from-blue-500 to-blue-700",
    name: "Develo EHR Link",
    description: "Send the Develo EHR assessment link 7 days before all appointments so families arrive prepared.",
    triggerEvent: "X_DAYS_BEFORE",
    triggerOffsetHours: -168,
    conditions: [],
    defaultName: "Develo EHR — 7 days before appointment",
  },
  {
    id: "novopsych",
    icon: BrainCircuit,
    gradient: "from-purple-500 to-purple-700",
    name: "NovoPsych Screening",
    description: "Send NovoPsych screening link 3 days before developmental or behavioral visits.",
    triggerEvent: "X_DAYS_BEFORE",
    triggerOffsetHours: -72,
    conditions: [{ type: "visitType", visitType: "DEVELOPMENTAL" }],
    defaultName: "NovoPsych — 3 days before developmental visit",
  },
  {
    id: "reminder-48hr",
    icon: Bell,
    gradient: "from-amber-500 to-orange-600",
    name: "48hr Appointment Reminder",
    description: "Remind all families 48 hours before their scheduled appointment.",
    triggerEvent: "X_DAYS_BEFORE",
    triggerOffsetHours: -48,
    conditions: [],
    defaultName: "48hr reminder — all appointments",
  },
  {
    id: "reminder-24hr",
    icon: AlarmClock,
    gradient: "from-orange-500 to-red-600",
    name: "24hr Appointment Reminder",
    description: "A final reminder email sent 24 hours before the appointment.",
    triggerEvent: "X_DAYS_BEFORE",
    triggerOffsetHours: -24,
    conditions: [],
    defaultName: "24hr reminder — all appointments",
  },
  {
    id: "reminder-same-day",
    icon: Clock,
    gradient: "from-red-500 to-rose-600",
    name: "Same-Day Reminder",
    description: "Day-of reminder sent 2 hours before the appointment.",
    triggerEvent: "X_DAYS_BEFORE",
    triggerOffsetHours: -2,
    conditions: [],
    defaultName: "Same-day reminder — 2hrs before appointment",
  },
  {
    id: "post-visit",
    icon: Heart,
    gradient: "from-green-500 to-emerald-600",
    name: "Post-Visit Follow-Up",
    description: "A thoughtful follow-up email sent 24 hours after the appointment.",
    triggerEvent: "X_DAYS_AFTER",
    triggerOffsetHours: 24,
    conditions: [],
    defaultName: "Post-visit follow-up — 24hrs after appointment",
  },
  {
    id: "well-child-milestone",
    icon: Star,
    gradient: "from-teal-500 to-cyan-600",
    name: "Well Child Milestone Email",
    description: "Age-appropriate milestone email sent 1 week before Well Child Check visits.",
    triggerEvent: "X_DAYS_BEFORE",
    triggerOffsetHours: -168,
    conditions: [{ type: "visitType", visitType: "WELL_CHILD_VISIT" }],
    defaultName: "Well Child milestone — 1 week before visit",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function getTriggerLabel(event: TriggerEvent, offsetHours: number | null): string {
  switch (event) {
    case "APPOINTMENT_CREATED":   return "When appointment is created";
    case "APPOINTMENT_UPDATED":   return "When appointment is updated";
    case "APPOINTMENT_CANCELLED": return "When appointment is cancelled";
    case "PATIENT_CREATED":       return "When patient record is created";
    case "X_DAYS_BEFORE": {
      const hrs = Math.abs(offsetHours ?? 48);
      if (hrs === 1) return "1 hour before appointment";
      if (hrs % 24 === 0) {
        const days = hrs / 24;
        return `${days} day${days !== 1 ? "s" : ""} before appointment`;
      }
      return `${hrs} hours before appointment`;
    }
    case "X_DAYS_AFTER": {
      const hrs = Math.abs(offsetHours ?? 24);
      if (hrs === 1) return "1 hour after appointment";
      if (hrs % 24 === 0) {
        const days = hrs / 24;
        return `${days} day${days !== 1 ? "s" : ""} after appointment`;
      }
      return `${hrs} hours after appointment`;
    }
  }
}

function getConditionLabel(c: Condition): string {
  if (c.type === "visitType")   return VISIT_LABELS[c.visitType ?? ""] ?? c.visitType ?? "";
  if (c.type === "ageRange")    return `Age ${c.ageMin ?? 0}–${c.ageMax ?? 18}`;
  if (c.type === "doctor")      return c.doctor ?? "";
  if (c.type === "patientType") return c.patientType === "NEW" ? "New patients" : "Established patients";
  return "";
}

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

// ── Toggle ─────────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed",
        checked ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
      )}
    >
      <span className={cn(
        "inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform duration-200",
        checked ? "translate-x-5" : "translate-x-0"
      )} />
    </button>
  );
}

// ── Rule Card ──────────────────────────────────────────────────────────────────

function RuleCard({
  rule,
  onToggle,
  onEdit,
  toggling,
}: {
  rule: AutomationRule;
  onToggle: (id: string, current: boolean) => void;
  onEdit: (rule: AutomationRule) => void;
  toggling: boolean;
}) {
  const meta = TRIGGER_META[rule.triggerEvent];
  const TriggerIcon = meta.icon;
  const conditions = rule.conditions ?? [];

  return (
    <div
      className={cn(
        "group relative bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200/80 dark:border-slate-700/60",
        "border-l-4 transition-shadow hover:shadow-md",
        meta.border,
        !rule.isActive && "opacity-60"
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm leading-tight truncate pr-2">
            {rule.name}
          </h3>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Toggle checked={rule.isActive} onChange={() => onToggle(rule.id, rule.isActive)} disabled={toggling} />
          <span className={cn("text-xs font-medium", rule.isActive ? "text-green-600 dark:text-green-400" : "text-slate-400 dark:text-slate-500")}>
            {rule.isActive ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      {/* Trigger */}
      <div className="px-5 pb-3 flex items-center gap-2">
        <div className={cn("p-1.5 rounded-md flex-shrink-0", meta.bg, meta.darkBg)}>
          <TriggerIcon className={cn("h-3.5 w-3.5", meta.color)} />
        </div>
        <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">
          {getTriggerLabel(rule.triggerEvent, rule.triggerOffsetHours)}
        </span>
      </div>

      {/* Conditions */}
      {conditions.length > 0 && (
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          {conditions.map((c, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
            >
              <Filter className="h-2.5 w-2.5" />
              {getConditionLabel(c)}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="px-5 pb-4 pt-1 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5 min-w-0">
          <Send className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{rule.template.name}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onEdit(rule)}
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      </div>
    </div>
  );
}

// ── Suggestion Card ────────────────────────────────────────────────────────────

function SuggestionCard({ s, onEnable }: { s: Suggestion; onEnable: (s: Suggestion) => void }) {
  const Icon = s.icon;
  return (
    <div className="relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm overflow-hidden flex flex-col">
      {/* Gradient strip */}
      <div className={cn("h-1.5 w-full bg-gradient-to-r", s.gradient)} />
      <div className="p-5 flex-1 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className={cn("p-2.5 rounded-lg bg-gradient-to-br shrink-0", s.gradient)}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 leading-tight">{s.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-snug">{s.description}</p>
          </div>
        </div>

        {/* Trigger badge */}
        <div className="flex flex-wrap gap-1.5 mt-auto">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {getTriggerLabel(s.triggerEvent, s.triggerOffsetHours)}
          </span>
          {s.conditions.map((c, i) => (
            <span key={i} className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-500">
              {c.visitType ? VISIT_LABELS[c.visitType] ?? c.visitType : ""}
            </span>
          ))}
        </div>

        <Button
          size="sm"
          className={cn("gap-2 w-full mt-1 bg-gradient-to-r text-white border-0 hover:opacity-90 transition-opacity", s.gradient)}
          onClick={() => onEnable(s)}
        >
          <Zap className="h-3.5 w-3.5" /> Enable This Rule
        </Button>
      </div>
    </div>
  );
}

// ── Editor Panel (slide-over) ──────────────────────────────────────────────────

function EditorPanel({
  open,
  rule,
  templates,
  templatesLoading,
  saving,
  deleting,
  error,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  rule: AutomationRule | null; // null = new rule
  templates: Template[];
  templatesLoading: boolean;
  saving: boolean;
  deleting: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (payload: {
    name: string;
    triggerEvent: TriggerEvent;
    triggerOffsetHours: number | null;
    conditions: Omit<Condition, "id">[];
    templateId: string;
  }) => void;
  onDelete: () => void;
}) {
  const isNew = rule === null;

  // Form state — reinitialise when rule changes
  const [name, setName]               = useState("");
  const [trigger, setTrigger]         = useState<TriggerEvent>("X_DAYS_BEFORE");
  const [offsetAbs, setOffsetAbs]     = useState(48); // always positive
  const [conditions, setConditions]   = useState<Condition[]>([]);
  const [templateId, setTemplateId]   = useState("");
  const [addCondType, setAddCondType] = useState<ConditionType | "">("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Sync form when panel opens / rule changes
  useEffect(() => {
    if (!open) { setDeleteConfirm(false); return; }
    if (rule) {
      setName(rule.name);
      setTrigger(rule.triggerEvent);
      setOffsetAbs(Math.abs(rule.triggerOffsetHours ?? 48));
      setConditions(
        (rule.conditions ?? []).map((c) => ({ ...c, id: c.id ?? makeId() }))
      );
      setTemplateId(rule.templateId);
    } else {
      setName("");
      setTrigger("X_DAYS_BEFORE");
      setOffsetAbs(48);
      setConditions([]);
      setTemplateId("");
    }
    setAddCondType("");
    setDeleteConfirm(false);
  }, [open, rule]);

  const isTimeBased = trigger === "X_DAYS_BEFORE" || trigger === "X_DAYS_AFTER";

  function handleAddCondition(type: ConditionType) {
    const defaults: Record<ConditionType, Omit<Condition, "id" | "type">> = {
      visitType:   { visitType: "WELL_CHILD_VISIT" },
      ageRange:    { ageMin: 0, ageMax: 5 },
      doctor:      { doctor: "" },
      patientType: { patientType: "NEW" },
    };
    setConditions(prev => [...prev, { id: makeId(), type, ...defaults[type] } as Condition]);
    setAddCondType("");
  }

  function removeCondition(id: string) {
    setConditions(prev => prev.filter(c => c.id !== id));
  }

  function updateCondition(id: string, patch: Partial<Condition>) {
    setConditions(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  function handleSave() {
    const offsetHours =
      trigger === "X_DAYS_BEFORE" ? -Math.abs(offsetAbs) :
      trigger === "X_DAYS_AFTER"  ?  Math.abs(offsetAbs) : null;

    onSave({
      name,
      triggerEvent: trigger,
      triggerOffsetHours: offsetHours,
      conditions: conditions.map(({ id: _id, ...rest }) => rest),
      templateId,
    });
  }

  if (!open) return null;

  const sectionLabel = "flex items-center gap-2.5 mb-4";
  const sectionIcon  = "p-1.5 rounded-lg";
  const sectionTitle = "text-xs font-bold uppercase tracking-widest";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex flex-col w-full sm:w-[580px] bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-700 overflow-hidden">

        {/* Panel header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 flex-shrink-0">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              {isNew ? "New Rule" : "Edit Rule"}
            </p>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
              {isNew ? "Automation Rule Builder" : (name || rule?.name)}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

          {/* Rule name */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
              Rule Name
            </label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. 48hr reminder — all appointments"
              className="text-sm"
            />
          </div>

          {/* ── TRIGGER ── */}
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/10 p-5">
            <div className={sectionLabel}>
              <div className={cn(sectionIcon, "bg-amber-100 dark:bg-amber-900/40")}>
                <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <span className={cn(sectionTitle, "text-amber-700 dark:text-amber-400")}>Trigger</span>
              <span className="text-xs text-slate-400 dark:text-slate-500 font-normal ml-auto">When does this rule fire?</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">When…</label>
                <select
                  value={trigger}
                  onChange={e => setTrigger(e.target.value as TriggerEvent)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                >
                  <option value="X_DAYS_BEFORE">X hours before appointment</option>
                  <option value="X_DAYS_AFTER">X hours after appointment</option>
                  <option value="APPOINTMENT_CREATED">Appointment is created</option>
                  <option value="APPOINTMENT_UPDATED">Appointment is updated</option>
                  <option value="APPOINTMENT_CANCELLED">Appointment is cancelled</option>
                  <option value="PATIENT_CREATED">Patient record is created</option>
                </select>
              </div>

              {isTimeBased && (
                <div className="flex items-center gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Hours</label>
                    <Input
                      type="number"
                      min={1}
                      max={8760}
                      value={offsetAbs}
                      onChange={e => setOffsetAbs(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-24 text-sm"
                    />
                  </div>
                  <div className="pt-5 text-sm text-slate-600 dark:text-slate-400 font-medium">
                    {trigger === "X_DAYS_BEFORE" ? "hours before the appointment" : "hours after the appointment"}
                  </div>
                </div>
              )}

              {/* Human-readable summary */}
              {isTimeBased && (
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium bg-amber-100/60 dark:bg-amber-900/20 px-3 py-1.5 rounded-lg">
                  ↳ {getTriggerLabel(trigger, trigger === "X_DAYS_BEFORE" ? -offsetAbs : offsetAbs)}
                </p>
              )}
            </div>
          </div>

          {/* ── CONDITIONS ── */}
          <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/10 p-5">
            <div className={sectionLabel}>
              <div className={cn(sectionIcon, "bg-blue-100 dark:bg-blue-900/40")}>
                <Filter className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <span className={cn(sectionTitle, "text-blue-700 dark:text-blue-400")}>Conditions</span>
              <span className="text-xs text-slate-400 dark:text-slate-500 font-normal ml-auto">Optional — AND logic</span>
            </div>

            {conditions.length === 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 italic">
                No conditions — rule applies to all patients
              </p>
            )}

            {/* Condition chips */}
            <div className="space-y-2 mb-4">
              {conditions.map(c => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2"
                >
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wider w-20 flex-shrink-0">
                    {c.type === "visitType" ? "Visit" : c.type === "ageRange" ? "Age" : c.type === "doctor" ? "Doctor" : "Patient"}
                  </span>

                  {c.type === "visitType" && (
                    <select
                      value={c.visitType}
                      onChange={e => updateCondition(c.id, { visitType: e.target.value })}
                      className="flex-1 text-xs border-0 bg-transparent focus:outline-none text-slate-700 dark:text-slate-300"
                    >
                      {Object.entries(VISIT_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  )}

                  {c.type === "ageRange" && (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="number" min={0} max={17} value={c.ageMin ?? 0}
                        onChange={e => updateCondition(c.id, { ageMin: parseInt(e.target.value) || 0 })}
                        className="w-14 text-xs border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5 bg-transparent text-slate-700 dark:text-slate-300 focus:outline-none"
                      />
                      <span className="text-xs text-slate-400">to</span>
                      <input
                        type="number" min={1} max={18} value={c.ageMax ?? 18}
                        onChange={e => updateCondition(c.id, { ageMax: parseInt(e.target.value) || 18 })}
                        className="w-14 text-xs border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5 bg-transparent text-slate-700 dark:text-slate-300 focus:outline-none"
                      />
                      <span className="text-xs text-slate-400">years</span>
                    </div>
                  )}

                  {c.type === "doctor" && (
                    <input
                      type="text" value={c.doctor ?? ""} placeholder="e.g. Dr. Tamas"
                      onChange={e => updateCondition(c.id, { doctor: e.target.value })}
                      className="flex-1 text-xs border-0 bg-transparent focus:outline-none text-slate-700 dark:text-slate-300 placeholder:text-slate-400"
                    />
                  )}

                  {c.type === "patientType" && (
                    <select
                      value={c.patientType}
                      onChange={e => updateCondition(c.id, { patientType: e.target.value })}
                      className="flex-1 text-xs border-0 bg-transparent focus:outline-none text-slate-700 dark:text-slate-300"
                    >
                      <option value="NEW">New patients</option>
                      <option value="ESTABLISHED">Established patients</option>
                    </select>
                  )}

                  <button onClick={() => removeCondition(c.id)} className="ml-auto p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-red-500 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add condition */}
            <div className="flex items-center gap-2">
              <select
                value={addCondType}
                onChange={e => { const v = e.target.value as ConditionType | ""; if (v) handleAddCondition(v as ConditionType); else setAddCondType(""); }}
                className="flex-1 px-3 py-2 border border-dashed border-blue-300 dark:border-blue-700 rounded-lg text-xs bg-white dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="">+ Add condition…</option>
                <option value="visitType">Visit type is…</option>
                <option value="ageRange">Patient age is between…</option>
                <option value="doctor">Doctor is…</option>
                <option value="patientType">Patient is new / established</option>
              </select>
            </div>
          </div>

          {/* ── ACTION ── */}
          <div className="rounded-xl border border-green-200 dark:border-green-900/60 bg-green-50/40 dark:bg-green-950/10 p-5">
            <div className={sectionLabel}>
              <div className={cn(sectionIcon, "bg-green-100 dark:bg-green-900/40")}>
                <Send className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <span className={cn(sectionTitle, "text-green-700 dark:text-green-400")}>Action</span>
              <span className="text-xs text-slate-400 dark:text-slate-500 font-normal ml-auto">What email gets sent?</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Then send…</label>
              {templatesLoading ? (
                <Skeleton className="h-10 w-full rounded-lg" />
              ) : templates.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic">No active templates found. Create one first.</p>
              ) : (
                <select
                  value={templateId}
                  onChange={e => setTemplateId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-green-500/30"
                >
                  <option value="">Select a template…</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                  ))}
                </select>
              )}

              {/* Template preview info */}
              {templateId && (() => {
                const t = templates.find(t => t.id === templateId);
                return t ? (
                  <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/40">
                    <Send className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-green-800 dark:text-green-300">{t.name}</p>
                      <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">{t.subject}</p>
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>

        {/* Fixed footer */}
        <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 px-6 py-4">
          {deleteConfirm ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-slate-700 dark:text-slate-300 flex-1">Delete this rule permanently?</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="gap-2 bg-red-600 hover:bg-red-700 text-white"
                disabled={deleting}
                onClick={onDelete}
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Delete
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {!isNew && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 mr-auto"
                  onClick={() => setDeleteConfirm(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete Rule
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onClose} className="ml-auto">
                Cancel
              </Button>
              <Button
                size="sm"
                className="gap-2 bg-blue-600 hover:bg-blue-700"
                disabled={saving || !name.trim() || !templateId}
                onClick={handleSave}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {isNew ? "Create Rule" : "Save Changes"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function EmailAutomationPage() {
  const [rules, setRules]                   = useState<AutomationRule[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);
  const [filter, setFilter]                 = useState<"all" | "active" | "inactive">("all");
  const [togglingId, setTogglingId]         = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [templates, setTemplates]           = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const [editorOpen, setEditorOpen]         = useState(false);
  const [editingRule, setEditingRule]       = useState<AutomationRule | null>(null);
  const [saving, setSaving]                 = useState(false);
  const [deleting, setDeleting]             = useState(false);
  const [editorError, setEditorError]       = useState<string | null>(null);

  // ── Fetch rules ─────────────────────────────────────────────────────────────

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = filter !== "all" ? `?isActive=${filter === "active"}` : "";
      const res = await fetch(`/api/email/automation${params}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = await res.json();
      setRules(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load automation rules.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  // ── Fetch templates ──────────────────────────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await fetch("/api/email/templates?limit=100");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setTemplates(json.data.filter((t: Template) => t.isActive));
    } catch {
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // ── Toggle active ────────────────────────────────────────────────────────────

  const handleToggle = useCallback(async (id: string, current: boolean) => {
    setTogglingId(id);
    try {
      const res = await fetch(`/api/email/automation/${id}/toggle`, { method: "PATCH" });
      if (!res.ok) throw new Error();
      setRules(prev => prev.map(r => r.id === id ? { ...r, isActive: !current } : r));
    } catch {
      // silently revert — UI already shows current state
    } finally {
      setTogglingId(null);
    }
  }, []);

  // ── Open editor ──────────────────────────────────────────────────────────────

  function openEditor(rule: AutomationRule | null, suggestion?: Suggestion) {
    if (suggestion) {
      // Synthesise a "blank" rule from the suggestion as starting point
      const draft = {
        id: "",
        name: suggestion.defaultName,
        isActive: true,
        triggerEvent: suggestion.triggerEvent,
        triggerOffsetHours: suggestion.triggerOffsetHours,
        conditions: suggestion.conditions.map((c, i) => ({ ...c, id: String(i) })),
        templateId: "",
        template: { id: "", name: "", type: "" },
        createdAt: "",
        updatedAt: "",
      } as AutomationRule;
      setEditingRule(draft);
    } else {
      setEditingRule(rule);
    }
    setEditorError(null);
    setEditorOpen(true);
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async (payload: {
    name: string;
    triggerEvent: TriggerEvent;
    triggerOffsetHours: number | null;
    conditions: Omit<Condition, "id">[];
    templateId: string;
  }) => {
    setSaving(true);
    setEditorError(null);
    const isNew = !editingRule?.id;
    try {
      const res = await fetch(
        isNew ? "/api/email/automation" : `/api/email/automation/${editingRule!.id}`,
        {
          method: isNew ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save rule");
      setEditorOpen(false);
      fetchRules();
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : "Failed to save rule.");
    } finally {
      setSaving(false);
    }
  }, [editingRule, fetchRules]);

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async () => {
    if (!editingRule?.id) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/email/automation/${editingRule.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Failed to delete");
      }
      setEditorOpen(false);
      fetchRules();
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : "Failed to delete rule.");
    } finally {
      setDeleting(false);
    }
  }, [editingRule, fetchRules]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const activeCount   = rules.filter(r => r.isActive).length;
  const inactiveCount = rules.filter(r => !r.isActive).length;
  const isEmpty       = !loading && rules.length === 0;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="pt-4 pb-12 space-y-8">

        {/* ── Hero header ── */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 px-6 py-8 sm:px-8">
          {/* Decorative glow */}
          <div className="absolute -top-10 -right-10 w-64 h-64 rounded-full bg-blue-600/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full bg-purple-600/10 blur-3xl pointer-events-none" />

          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/30">
                  <Zap className="h-6 w-6 text-amber-400" />
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Email Automation</h1>
              </div>
              <p className="text-slate-400 text-sm max-w-xl leading-relaxed">
                Rules that run silently in the background — sending the right email at exactly the right moment, to exactly the right patient, without any manual work.
              </p>
              {/* Stats */}
              {!loading && (
                <div className="flex items-center gap-6 mt-4">
                  <div>
                    <p className="text-2xl font-bold text-white">{activeCount}</p>
                    <p className="text-xs text-slate-400 uppercase tracking-wide">Active</p>
                  </div>
                  <div className="w-px h-8 bg-slate-700" />
                  <div>
                    <p className="text-2xl font-bold text-white">{rules.length}</p>
                    <p className="text-xs text-slate-400 uppercase tracking-wide">Total Rules</p>
                  </div>
                  <div className="w-px h-8 bg-slate-700" />
                  <div>
                    <p className="text-2xl font-bold text-white">{inactiveCount}</p>
                    <p className="text-xs text-slate-400 uppercase tracking-wide">Inactive</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:items-end gap-2 flex-shrink-0">
              <Button
                className="gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold border-0"
                onClick={() => openEditor(null)}
              >
                <Plus className="h-4 w-4" /> New Rule
              </Button>
              <Button
                variant="outline"
                className="gap-2 border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white"
                onClick={() => setShowSuggestions(v => !v)}
              >
                <ClipboardList className="h-4 w-4" />
                {showSuggestions ? "Hide Templates" : "Add from Templates"}
              </Button>
            </div>
          </div>
        </div>

        {/* ── Filter tabs ── */}
        <div className="flex gap-0 border-b border-slate-200 dark:border-slate-700">
          {([["all", "All Rules"], ["active", "Active"], ["inactive", "Inactive"]] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                filter === val
                  ? "border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Rules grid ── */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
                <div className="flex justify-between">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-6 w-11 rounded-full" />
                </div>
                <Skeleton className="h-4 w-36" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-red-200 dark:border-red-800 p-8 flex flex-col items-center gap-4">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <div className="text-center">
              <p className="font-semibold text-slate-900 dark:text-slate-50">Failed to load automation rules</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{error}</p>
            </div>
            <Button onClick={fetchRules}>Try again</Button>
          </div>
        ) : isEmpty ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 py-16 flex flex-col items-center gap-4">
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30">
              <Zap className="h-10 w-10 text-amber-500" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-900 dark:text-slate-50 text-lg">No automation rules yet</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-sm">
                Start with a pre-built template below or create your own rule from scratch.
              </p>
            </div>
            <div className="flex gap-2">
              <Button className="gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold" onClick={() => openEditor(null)}>
                <Plus className="h-4 w-4" /> New Rule
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => setShowSuggestions(true)}>
                <ClipboardList className="h-4 w-4" /> Browse Templates
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rules.map(rule => (
              <RuleCard
                key={rule.id}
                rule={rule}
                onToggle={handleToggle}
                onEdit={r => openEditor(r)}
                toggling={togglingId === rule.id}
              />
            ))}
          </div>
        )}

        {/* ── Pre-built suggestions ── */}
        {(showSuggestions || isEmpty) && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Pre-Built Rule Templates</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  One click to enable — you can customise before saving.
                </p>
              </div>
              {!isEmpty && (
                <Button variant="ghost" size="sm" className="text-slate-400" onClick={() => setShowSuggestions(false)}>
                  <X className="h-4 w-4 mr-1" /> Hide
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {SUGGESTIONS.map(s => (
                <SuggestionCard key={s.id} s={s} onEnable={s => openEditor(null, s)} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Editor slide-over ── */}
      <EditorPanel
        open={editorOpen}
        rule={editingRule?.id ? editingRule : null}
        templates={templates}
        templatesLoading={templatesLoading}
        saving={saving}
        deleting={deleting}
        error={editorError}
        onClose={() => { setEditorOpen(false); setEditorError(null); }}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </>
  );
}
