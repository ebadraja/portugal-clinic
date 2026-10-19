"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoadState, ReadOnlyNotice, SectionCard, hintCls, inputCls, labelCls, selectCls, useIsAdmin } from "@/components/settings/shared";
import { useClinicSettings, useDraft } from "@/components/settings/use-clinic-settings";
import { WEEK_ORDER, type BookingPolicy, type BusinessHour, type ClinicIdentity, type ClinicSettingsDto, type Holidays, type LunchBreak, type Provider } from "@/components/settings/clinic-types";

const TIMEZONES = ["Europe/Lisbon", "Atlantic/Madeira", "Atlantic/Azores", "Europe/Madrid", "Europe/London"];

export function PracticeSettingsTab() {
  const { data, loading, error, reload, save, savingSection } = useClinicSettings();
  const isAdmin = useIsAdmin();

  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;

  return (
    <div className="space-y-6">
      {!isAdmin && <ReadOnlyNotice />}
      {data.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 p-3 text-sm text-amber-800 dark:text-amber-300 space-y-1">
          {data.warnings.map((w) => <p key={w}>{w}</p>)}
        </div>
      )}
      <PracticeDetails data={data} canEdit={isAdmin} saving={savingSection === "practice"} onSave={(v) => save("practice", { practice: v })} />
      <OpeningHours data={data} canEdit={isAdmin} saving={savingSection === "hours"} onSave={(hours, lunch) => save("hours", { businessHours: hours, lunchBreak: lunch })} />
      <HolidaysSection data={data} canEdit={isAdmin} saving={savingSection === "holidays"} onSave={(h) => save("holidays", { holidays: h })} />
      <BookingRules data={data} canEdit={isAdmin} saving={savingSection === "policy"} onSave={(p) => save("policy", { bookingPolicy: p })} />
      <Providers data={data} canEdit={isAdmin} saving={savingSection === "providers"} onSave={(p) => save("providers", { providers: p })} />
      <Identity data={data} canEdit={isAdmin} saving={savingSection === "identity"} onSave={(i, tz, locale) => save("identity", { identity: i, timezone: tz, locale })} />
    </div>
  );
}

type SectionProps<T> = { data: ClinicSettingsDto; canEdit: boolean; saving: boolean; onSave: T };

function PracticeDetails({ data, canEdit, saving, onSave }: SectionProps<(v: ClinicSettingsDto["practice"]) => Promise<boolean>>) {
  const [draft, setDraft, dirty] = useDraft(data.practice);
  if (!draft) return null;
  const field = (key: keyof typeof draft, label: string, type = "text") => (
    <div>
      <label className={labelCls}>{label}</label>
      <Input type={type} className={inputCls} value={draft[key]} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
    </div>
  );
  return (
    <SectionCard title="Practice details" description="Shown to patients in emails and used by the voice agent." onSave={() => onSave(draft)} saving={saving} dirty={dirty} canEdit={canEdit}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {field("name", "Practice name")}
        {field("tagline", "Tagline")}
        {field("phone", "Phone", "tel")}
        {field("email", "Email", "email")}
        {field("address", "Address")}
        {field("website", "Website", "url")}
      </div>
    </SectionCard>
  );
}

function OpeningHours({ data, canEdit, saving, onSave }: SectionProps<(h: BusinessHour[], l: LunchBreak) => Promise<boolean>>) {
  const [hours, setHours, hoursDirty] = useDraft(data.businessHours);
  const [lunch, setLunch, lunchDirty] = useDraft(data.lunchBreak);
  if (!hours || !lunch) return null;
  const setDay = (day: string, patch: Partial<BusinessHour>) => setHours(hours.map((h) => (h.day === day ? { ...h, ...patch } : h)));
  return (
    <SectionCard
      title="Opening hours"
      description="The voice agent and the staff calendar only offer slots inside these hours (clinic time). Lunch closes every open day."
      onSave={() => onSave(hours, lunch)}
      saving={saving}
      dirty={hoursDirty || lunchDirty}
      canEdit={canEdit}
    >
      <div className="space-y-2">
        {WEEK_ORDER.map((day) => {
          const h = hours.find((r) => r.day === day)!;
          return (
            <div key={day} className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 w-36 text-sm font-medium text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={h.enabled} disabled={!canEdit} onChange={(e) => setDay(day, { enabled: e.target.checked })} className="rounded accent-blue-600" />
                {day}
              </label>
              {h.enabled ? (
                <div className="flex items-center gap-2">
                  <Input type="time" value={h.open} disabled={!canEdit} onChange={(e) => setDay(day, { open: e.target.value })} className={`w-28 ${inputCls}`} />
                  <span className="text-slate-500">–</span>
                  <Input type="time" value={h.close} disabled={!canEdit} onChange={(e) => setDay(day, { close: e.target.value })} className={`w-28 ${inputCls}`} />
                </div>
              ) : (
                <span className="text-sm text-slate-500">Closed</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 w-36 text-sm font-medium text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={lunch.enabled} disabled={!canEdit} onChange={(e) => setLunch({ ...lunch, enabled: e.target.checked })} className="rounded accent-blue-600" />
          Lunch break
        </label>
        {lunch.enabled && (
          <div className="flex items-center gap-2">
            <Input type="time" value={lunch.start} disabled={!canEdit} onChange={(e) => setLunch({ ...lunch, start: e.target.value })} className={`w-28 ${inputCls}`} />
            <span className="text-slate-500">–</span>
            <Input type="time" value={lunch.end} disabled={!canEdit} onChange={(e) => setLunch({ ...lunch, end: e.target.value })} className={`w-28 ${inputCls}`} />
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function HolidaysSection({ data, canEdit, saving, onSave }: SectionProps<(h: Holidays) => Promise<boolean>>) {
  const [draft, setDraft, dirty] = useDraft(data.holidays);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  if (!draft) return null;
  const today = new Date().toISOString().slice(0, 10);
  const upcomingNational = (data.nationalHolidays ?? []).filter((h) => h.date >= today).slice(0, 8);
  const add = () => {
    if (!newDate || !newName.trim() || draft.closures.some((c) => c.date === newDate)) return;
    setDraft({ ...draft, closures: [...draft.closures, { date: newDate, name: newName.trim() }].sort((a, b) => a.date.localeCompare(b.date)) });
    setNewDate("");
    setNewName("");
  };
  return (
    <SectionCard title="Holidays & closures" description="Days the clinic is closed. The agent never offers these dates." onSave={() => onSave(draft)} saving={saving} dirty={dirty} canEdit={canEdit}>
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input type="checkbox" checked={draft.observeNationalHolidays} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, observeNationalHolidays: e.target.checked })} className="rounded accent-blue-600" />
        Close on Portuguese national holidays (computed automatically, including Easter dates)
      </label>
      {draft.observeNationalHolidays && upcomingNational.length > 0 && (
        <p className={hintCls}>Next: {upcomingNational.map((h) => `${h.date.slice(8, 10)}/${h.date.slice(5, 7)} ${h.name}`).join(" · ")}</p>
      )}
      <div>
        <p className={labelCls}>Clinic closures (municipal holiday, holidays, training…)</p>
        {draft.closures.length === 0 && <p className="text-sm text-slate-500">None added. Add the Mafra municipal holiday and any planned closures.</p>}
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {draft.closures.map((c) => (
            <li key={c.date} className="flex items-center justify-between py-2 text-sm">
              <span><span className="font-mono">{c.date}</span> — {c.name}</span>
              {canEdit && (
                <Button variant="ghost" size="sm" aria-label={`Remove ${c.name}`} onClick={() => setDraft({ ...draft, closures: draft.closures.filter((x) => x.date !== c.date) })} className="text-red-600">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="flex flex-wrap gap-2 mt-2">
            <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={`w-44 ${inputCls}`} />
            <Input placeholder="Reason (e.g. Feriado municipal)" value={newName} onChange={(e) => setNewName(e.target.value)} className={`flex-1 min-w-[180px] ${inputCls}`} />
            <Button variant="outline" size="sm" onClick={add} disabled={!newDate || !newName.trim()} className="gap-1.5 h-9"><Plus className="h-4 w-4" />Add</Button>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function BookingRules({ data, canEdit, saving, onSave }: SectionProps<(p: BookingPolicy) => Promise<boolean>>) {
  const [draft, setDraft, dirty] = useDraft(data.bookingPolicy);
  if (!draft) return null;
  const num = (key: keyof BookingPolicy, label: string, hint: string, min: number, max: number) => (
    <div>
      <label className={labelCls}>{label}</label>
      <Input type="number" min={min} max={max} value={draft[key] as number} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })} className={inputCls} />
      <p className={hintCls}>{hint}</p>
    </div>
  );
  return (
    <SectionCard title="Booking rules" description="Applied by the voice agent's tools; staff can override them in the calendar." onSave={() => onSave(draft)} saving={saving} dirty={dirty} canEdit={canEdit}>
      <div>
        <label className={labelCls}>New patients</label>
        <select value={draft.newPatientMode} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, newPatientMode: e.target.value as BookingPolicy["newPatientMode"] })} className={selectCls}>
          <option value="callback">Take details — the team confirms capacity and calls back (current clinic rule)</option>
          <option value="book">Allow the agent to book new patients directly</option>
        </select>
        <p className={hintCls}>Unknown callers can never be booked by the agent without a patient record; this decides what the agent is told to say.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {num("cancellationNoticeHours", "Cancellation notice (hours)", "Later cancellations are flagged to staff.", 0, 168)}
        {num("lateToleranceMinutes", "Late tolerance (minutes)", "Told to patients when booking.", 0, 60)}
        {num("recallMonths", "Recall interval (months)", "Routine check-up cadence.", 1, 36)}
        {num("slotMinutes", "Slot grid (minutes)", "Spacing of offered start times.", 5, 120)}
        {num("minNoticeMinutes", "Minimum notice (minutes)", "Agent won't book sooner than this.", 0, 10080)}
        {num("maxDaysAhead", "Book up to (days ahead)", "Furthest date the agent offers.", 1, 365)}
      </div>
    </SectionCard>
  );
}

const PROVIDER_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#0ea5e9", "#ef4444", "#14b8a6"];
const WEEKDAYS: [number, string][] = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]];

function Providers({ data, canEdit, saving, onSave }: SectionProps<(p: Provider[]) => Promise<boolean>>) {
  const [draft, setDraft, dirty] = useDraft(data.providers);
  const [open, setOpen] = useState<string | null>(null);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!canEdit) return;
    fetch("/api/staff")
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setStaff((d.users ?? []).filter((u: { isActive: boolean }) => u.isActive).map((u: { id: string; firstName: string; lastName: string }) => ({ id: u.id, name: `${u.firstName} ${u.lastName}` }))))
      .catch(() => {});
  }, [canEdit]);
  if (!draft) return null;
  const set = (i: number, patch: Partial<Provider>) => setDraft(draft.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const add = () => {
    const id = `provider-${Date.now().toString(36)}`;
    setDraft([...draft, { id, name: "", title: "Médico(a) Dentista", registrationNumber: "", active: true, color: PROVIDER_COLORS[draft.length % PROVIDER_COLORS.length], workingHours: null, appointmentTypes: [], agentBookable: true, userId: null }]);
    setOpen(id);
  };
  const clinicWindows = (): Provider["workingHours"] =>
    WEEKDAYS.flatMap(([wd, ]) => {
      const name = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][wd];
      const h = data.businessHours.find((b) => b.day === name);
      if (!h?.enabled) return [];
      const l = data.lunchBreak;
      return l.enabled && l.start > h.open && l.end < h.close
        ? [{ weekday: wd, start: h.open, end: l.start }, { weekday: wd, start: l.end, end: h.close }]
        : [{ weekday: wd, start: h.open, end: h.close }];
    });
  const activeTypes = data.appointmentTypes.filter((t) => t.active);
  return (
    <SectionCard
      title="Dentists & hygienists"
      description="Everyone appointments are booked with. Each person gets a column in the agenda; their hours and services decide when the desk and Acácia can book them."
      onSave={() => onSave(draft.filter((p) => p.name.trim()))}
      saving={saving}
      dirty={dirty}
      canEdit={canEdit}
      actions={canEdit ? <Button variant="outline" size="sm" onClick={add} className="gap-1.5"><Plus className="h-4 w-4" />Add person</Button> : undefined}
    >
      {draft.length === 0 && <p className="text-sm text-slate-500">Nobody yet — the agenda then works as a single column.</p>}
      {draft.map((p, i) => {
        const expanded = open === p.id;
        return (
          <div key={p.id} className="rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="grid grid-cols-1 items-center gap-2 p-3 sm:grid-cols-[auto_1fr_1fr_9rem_auto_auto_auto]">
              <input type="color" aria-label="Agenda colour" value={p.color} disabled={!canEdit} onChange={(e) => set(i, { color: e.target.value })} className="h-8 w-8 cursor-pointer rounded border border-slate-300 dark:border-slate-600" />
              <Input placeholder="Name" value={p.name} disabled={!canEdit} onChange={(e) => set(i, { name: e.target.value })} className={inputCls} />
              <Input placeholder="Title" value={p.title} disabled={!canEdit} onChange={(e) => set(i, { title: e.target.value })} className={inputCls} />
              <Input placeholder="OMD nº" value={p.registrationNumber} disabled={!canEdit} onChange={(e) => set(i, { registrationNumber: e.target.value })} className={inputCls} />
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={p.active} disabled={!canEdit} onChange={(e) => set(i, { active: e.target.checked })} className="rounded accent-blue-600" />Active
              </label>
              <Button variant="ghost" size="sm" onClick={() => setOpen(expanded ? null : p.id)} aria-expanded={expanded}>{expanded ? "Less" : "Hours & services"}</Button>
              {canEdit && (
                <Button variant="ghost" size="sm" aria-label={`Remove ${p.name || "person"}`} onClick={() => setDraft(draft.filter((_, j) => j !== i))} className="text-red-600"><Trash2 className="h-4 w-4" /></Button>
              )}
            </div>
            {expanded && (
              <div className="grid gap-4 border-t border-slate-100 p-3 dark:border-slate-800">
                <div className="flex flex-wrap gap-4 text-sm text-slate-700 dark:text-slate-300">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={p.agentBookable} disabled={!canEdit} onChange={(e) => set(i, { agentBookable: e.target.checked })} className="rounded accent-blue-600" />
                    Acácia may book with this person
                  </label>
                  <label className="flex items-center gap-2">
                    Staff login
                    <select value={p.userId ?? ""} disabled={!canEdit} onChange={(e) => set(i, { userId: e.target.value || null })} className={selectCls + " w-48"}>
                      <option value="">— none —</option>
                      {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </label>
                </div>

                <div>
                  <p className={labelCls}>Appointment types</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={p.appointmentTypes.length === 0} disabled={!canEdit} onChange={(e) => set(i, { appointmentTypes: e.target.checked ? [] : activeTypes.map((t) => t.type) })} className="rounded accent-blue-600" />
                      All types
                    </label>
                    {p.appointmentTypes.length > 0 && activeTypes.map((t) => (
                      <label key={t.type} className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={p.appointmentTypes.includes(t.type)}
                          disabled={!canEdit}
                          onChange={(e) => {
                            const next = e.target.checked ? [...p.appointmentTypes, t.type] : p.appointmentTypes.filter((x) => x !== t.type);
                            set(i, { appointmentTypes: next.length === 0 ? [] : next });
                          }}
                          className="rounded accent-blue-600"
                        />
                        {t.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <p className={labelCls + " mb-0"}>Working hours</p>
                    <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                      <input type="checkbox" checked={p.workingHours === null} disabled={!canEdit} onChange={(e) => set(i, { workingHours: e.target.checked ? null : clinicWindows() })} className="rounded accent-blue-600" />
                      Same as the clinic&apos;s opening hours
                    </label>
                  </div>
                  {p.workingHours !== null && (
                    <div className="grid gap-1.5">
                      {WEEKDAYS.map(([wd, label]) => {
                        const rows = (p.workingHours ?? []).map((w, idx) => ({ w, idx })).filter((r) => r.w.weekday === wd);
                        const update = (fn: (list: NonNullable<Provider["workingHours"]>) => NonNullable<Provider["workingHours"]>) => set(i, { workingHours: fn([...(p.workingHours ?? [])]) });
                        return (
                          <div key={wd} className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="w-10 text-slate-600 dark:text-slate-400">{label}</span>
                            {rows.length === 0 && <span className="text-slate-400">off</span>}
                            {rows.map(({ w, idx }) => (
                              <span key={idx} className="flex items-center gap-1">
                                <input type="time" value={w.start} disabled={!canEdit} onChange={(e) => update((l) => l.map((x, k) => (k === idx ? { ...x, start: e.target.value } : x)))} className="h-8 rounded border border-slate-300 bg-white px-1.5 text-sm dark:border-slate-600 dark:bg-slate-800" aria-label={`${label} from`} />
                                –
                                <input type="time" value={w.end} disabled={!canEdit} onChange={(e) => update((l) => l.map((x, k) => (k === idx ? { ...x, end: e.target.value } : x)))} className="h-8 rounded border border-slate-300 bg-white px-1.5 text-sm dark:border-slate-600 dark:bg-slate-800" aria-label={`${label} to`} />
                                {canEdit && <button type="button" aria-label="Remove window" onClick={() => update((l) => l.filter((_, k) => k !== idx))} className="px-1 text-slate-400 hover:text-red-600">×</button>}
                              </span>
                            ))}
                            {canEdit && (
                              <button type="button" onClick={() => update((l) => [...l, { weekday: wd, start: rows.length ? "14:00" : "09:30", end: rows.length ? "18:00" : "12:30" }])} className="text-xs text-blue-700 hover:underline dark:text-blue-300">
                                + add
                              </button>
                            )}
                          </div>
                        );
                      })}
                      <p className={hintCls}>Split shifts: add two windows on the same day. The clinic&apos;s lunch break and holidays always apply.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </SectionCard>
  );
}

function Identity({ data, canEdit, saving, onSave }: SectionProps<(i: ClinicIdentity, tz: string, locale: string) => Promise<boolean>>) {
  const [draft, setDraft, dirty] = useDraft(data.identity);
  const [tz, setTz] = useState(data.timezone);
  const [locale, setLocale] = useState(data.locale);
  if (!draft) return null;
  const changed = dirty || tz !== data.timezone || locale !== data.locale;
  return (
    <SectionCard
      title="Legal identity & locale"
      description="Required in patient-facing footers in Portugal (NIF, ERS registration, Livro de Reclamações)."
      onSave={() => onSave({ ...draft, omdNumbers: draft.omdNumbers.filter(Boolean) }, tz, locale)}
      saving={saving}
      dirty={changed}
      canEdit={canEdit}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Registered company name</label>
          <Input value={draft.legalName} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, legalName: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>NIF</label>
          <Input value={draft.nif} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, nif: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>ERS registration nº</label>
          <Input value={draft.ersNumber} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, ersNumber: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>OMD numbers (comma separated)</label>
          <Input value={draft.omdNumbers.join(", ")} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, omdNumbers: e.target.value.split(",").map((s) => s.trim()) })} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Livro de Reclamações link</label>
          <Input value={draft.complaintsBookUrl} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, complaintsBookUrl: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Clinic time zone</label>
          <select value={tz} disabled={!canEdit} onChange={(e) => setTz(e.target.value)} className={selectCls}>
            {TIMEZONES.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
          <p className={hintCls}>Every booking time is interpreted in this zone, whatever the server&apos;s zone.</p>
        </div>
        <div>
          <label className={labelCls}>Language for patient-facing text</label>
          <select value={locale} disabled={!canEdit} onChange={(e) => setLocale(e.target.value)} className={selectCls}>
            <option value="pt-PT">Português (Portugal)</option>
            <option value="en-GB">English</option>
            <option value="es-ES">Español</option>
          </select>
        </div>
      </div>
    </SectionCard>
  );
}
