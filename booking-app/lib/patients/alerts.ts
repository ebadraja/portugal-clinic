/**
 * Clinical alerts derived from what the record already says — allergies, medical notes and
 * free tags (Zappy "segmentos" were used by the clinic as a clinical diary, e.g.
 * "PCTE ONCOLÓGICA. ALERGICA AO ACIDO CLAVULANICO"). Nothing is stored: the alert follows
 * the text, so editing the text clears it.
 */

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Conditions a dentist must see before treating (pt-PT and English stems). */
const ALERT_PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'Allergy', re: /\balerg|\ballergy|\bhipersensib/ },
  { label: 'Anticoagulated', re: /anticoag|varfarin|warfarin|sintrom|xarelto|rivaroxab|apixab|eliquis|dabigatr|heparin/ },
  { label: 'Oncology', re: /oncolog|cancro|cancer|quimioter|radioter|tumor/ },
  { label: 'Bisphosphonates', re: /bifosfon|bisphosphon|zoledron|alendron/ },
  { label: 'Heart condition', re: /cardi|pacemaker|pace maker|marca passo|marcapasso|endocardit|valvul|enfarte|stent/ },
  { label: 'Diabetes', re: /diabet/ },
  { label: 'Pregnant', re: /gravid|gestant|pregnan/ },
  { label: 'Hypertension', re: /hipertens|hypertens/ },
  { label: 'Epilepsy', re: /epileps|convuls/ },
  { label: 'Infectious', re: /\bhiv\b|hepatite|hepatitis|tuberculo/ },
  { label: 'Bleeding disorder', re: /hemofil|hemorrag|coagulopat/ },
  { label: 'Asthma', re: /\basma\b|asthma/ },
]

export type PatientAlert = { label: string; source: string }

/** Alerts with the text that raised them (first match per condition). */
export function clinicalAlerts(input: { allergies?: string | null; medicalNotes?: string | null; tags?: string[] | null }): PatientAlert[] {
  const sources = [
    ...(input.allergies?.trim() ? [{ text: input.allergies, forceAllergy: true }] : []),
    ...(input.tags ?? []).map((t) => ({ text: t, forceAllergy: false })),
    ...(input.medicalNotes?.trim() ? [{ text: input.medicalNotes, forceAllergy: false }] : []),
  ]
  const out: PatientAlert[] = []
  const seen = new Set<string>()
  for (const s of sources) {
    const f = fold(s.text)
    for (const p of ALERT_PATTERNS) {
      if (seen.has(p.label)) continue
      if ((p.label === 'Allergy' && s.forceAllergy) || p.re.test(f)) {
        seen.add(p.label)
        out.push({ label: p.label, source: s.text.trim().slice(0, 160) })
      }
    }
  }
  return out
}

/** Patient lifecycle the patient list filters on (replaces Zappy's automatic segment). */
export type Lifecycle = 'new' | 'active' | 'lost' | 'potential'

export const LOST_AFTER_MONTHS = 18
export const NEW_WITHIN_DAYS = 30

export function lifecycleOf(p: { lastVisitAt: Date | null; patientSince: Date; hasUpcoming: boolean }, now = new Date()): Lifecycle {
  if (now.getTime() - p.patientSince.getTime() < NEW_WITHIN_DAYS * 86_400_000) return 'new'
  if (p.hasUpcoming) return 'active'
  if (!p.lastVisitAt) return 'potential'
  const lostBefore = new Date(now)
  lostBefore.setMonth(lostBefore.getMonth() - LOST_AFTER_MONTHS)
  return p.lastVisitAt < lostBefore ? 'lost' : 'active'
}

/** Birthday (month/day) from a full DOB or from the year-less fields. */
export function birthdayOf(p: { dateOfBirth: Date | null; birthDay?: number | null; birthMonth?: number | null }): { month: number; day: number } | null {
  if (p.dateOfBirth) return { month: p.dateOfBirth.getUTCMonth() + 1, day: p.dateOfBirth.getUTCDate() }
  if (p.birthDay && p.birthMonth) return { month: p.birthMonth, day: p.birthDay }
  return null
}
