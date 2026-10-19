// Insurers recorded on a patient's file (Portugal). Which of these the clinic
// actually works with is configured in Settings → AI Voice Agent → Insurers.
export const PLAN_TYPES = ["Seguro de saúde", "Acordo / protocolo", "Particular"] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export const HEALTH_INSURERS = [
  "AdvanceCare",
  "Médis",
  "Multicare",
  "Allianz",
  "Fidelidade",
  "Ageas",
  "Generali / Tranquilidade",
  "Outro",
] as const;

export const AGREEMENTS = [
  "RNA-ADE",
  "Liga dos Combatentes",
  "ADSE",
  "Outro",
] as const;

export const ALL_PLANS: Record<PlanType, readonly string[]> = {
  "Seguro de saúde": HEALTH_INSURERS,
  "Acordo / protocolo": AGREEMENTS,
  Particular: ["Sem seguro"],
};
