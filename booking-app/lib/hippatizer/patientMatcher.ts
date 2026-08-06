/**
 * Patient Matching Engine
 * Intelligently matches intake forms to existing patients
 * Uses fuzzy matching on name and exact matching on DOB
 */

import prisma from "@/lib/prisma";

export interface PatientMatch {
  patientId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  email?: string;
  phone?: string;
  confidence: number;
  matchReasons: string[];
}

/**
 * Calculate string similarity using Levenshtein distance
 * Returns 0-1 score (1 = perfect match)
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1;

  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Levenshtein distance algorithm
 */
function getEditDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let k = 0; k <= s1.length; k++) {
    let lastValue = k;
    for (let i = 0; i <= s2.length; i++) {
      if (k === 0) {
        costs[i] = i;
      } else if (i > 0) {
        let newValue = costs[i - 1];
        if (s1.charAt(k - 1) !== s2.charAt(i - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[i]) + 1;
        }
        costs[i - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (k > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

/**
 * Check if dates are the same calendar day (UTC) to avoid timezone off-by-one.
 */
function isSameDateOfBirth(date1: Date, date2: Date): boolean {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return (
    d1.getUTCFullYear() === d2.getUTCFullYear() &&
    d1.getUTCMonth() === d2.getUTCMonth() &&
    d1.getUTCDate() === d2.getUTCDate()
  );
}

/**
 * Scoring weights (must sum to ≤ 1.0 for full match):
 *   DOB exact        → +0.40  (heaviest — hard to forge coincidentally)
 *   First name ≥80%  → +score × 0.25
 *   Last name ≥80%   → +score × 0.25
 *   Email exact      → +0.10
 *   Phone exact      → +0.10
 *
 * Auto-link threshold (findBestPatientMatch):  0.85
 * Potential-match threshold (shown for manual): 0.50
 *   — 0.50 lets a perfect name match (0.25+0.25=0.50) surface even when DOB
 *     is absent/unparsed, so staff can still manually assign.
 */
export async function findPatientMatches(
  firstName: string,
  lastName: string,
  dateOfBirth: Date,
  email?: string,
  phone?: string
): Promise<PatientMatch[]> {
  if (!firstName || !lastName) {
    return [];
  }

  try {
    const patients = await prisma.patient.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        email: true,
        phone: true,
      },
    });

    const matches: PatientMatch[] = [];

    for (const patient of patients) {
      const matchReasons: string[] = [];
      let confidence = 0;

      // DOB exact match — UTC comparison to avoid timezone off-by-one
      if (dateOfBirth && !isNaN(dateOfBirth.getTime())) {
        const dobMatch = isSameDateOfBirth(dateOfBirth, patient.dateOfBirth);
        if (dobMatch) {
          confidence += 0.4;
          matchReasons.push("Date of birth match");
        }
      }

      // First name fuzzy similarity (Levenshtein)
      const firstNameScore = calculateStringSimilarity(firstName, patient.firstName);
      if (firstNameScore >= 0.8) {
        confidence += firstNameScore * 0.25;
        matchReasons.push(`First name similar (${(firstNameScore * 100).toFixed(0)}%)`);
      }

      // Last name fuzzy similarity
      const lastNameScore = calculateStringSimilarity(lastName, patient.lastName);
      if (lastNameScore >= 0.8) {
        confidence += lastNameScore * 0.25;
        matchReasons.push(`Last name similar (${(lastNameScore * 100).toFixed(0)}%)`);
      }

      // Email exact match
      if (email && patient.email && email.toLowerCase() === patient.email.toLowerCase()) {
        confidence += 0.1;
        matchReasons.push("Email match");
      }

      // Phone exact match (digits only)
      if (phone && patient.phone && normalizePhone(phone) === normalizePhone(patient.phone)) {
        confidence += 0.1;
        matchReasons.push("Phone match");
      }

      // Threshold 0.50 — surfaces perfect-name matches even without DOB
      if (confidence >= 0.5) {
        matches.push({
          patientId: patient.id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          dateOfBirth: patient.dateOfBirth,
          email: patient.email || undefined,
          phone: patient.phone || undefined,
          confidence: Math.min(confidence, 1),
          matchReasons,
        });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  } catch (error) {
    console.error("Error finding patient matches:", error);
    return [];
  }
}

/**
 * Normalize phone number for comparison
 * Removes all non-digit characters
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Find best match (if confidence is high enough)
 * Threshold: 0.85 (85%) confidence
 */
export async function findBestPatientMatch(
  firstName: string,
  lastName: string,
  dateOfBirth: Date,
  email?: string,
  phone?: string,
  confidenceThreshold: number = 0.85
): Promise<PatientMatch | null> {
  const matches = await findPatientMatches(
    firstName,
    lastName,
    dateOfBirth,
    email,
    phone
  );

  if (matches.length > 0 && matches[0].confidence >= confidenceThreshold) {
    return matches[0];
  }

  return null;
}
