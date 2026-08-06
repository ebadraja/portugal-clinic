export const PLAN_TYPES = ["Commercial", "Apple Health"] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export const COMMERCIAL_PLANS = [
  "Aetna",
  "Ambetter",
  "Asuris Northwest",
  "Blue Cross Blue Shield FEP",
  "Cigna",
  "First Health Network",
  "First Choice Health Network",
  "LifeWise",
  "Premera Blue Cross",
  "Regence Blue Shield",
  "Tricare/TriWest",
  "United Healthcare",
] as const;

export const APPLE_HEALTH_PLANS = [
  "Coordinated Care",
  "Molina",
  "United Healthcare",
  "Wellpoint",
] as const;

export const ALL_PLANS: Record<PlanType, readonly string[]> = {
  Commercial: COMMERCIAL_PLANS,
  "Apple Health": APPLE_HEALTH_PLANS,
};
