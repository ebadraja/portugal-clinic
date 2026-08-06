import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GcalVisitType =
  | "WELL"
  | "SICK"
  | "BH"
  | "NEW"
  | "NURSE"
  | "VIRTUAL"
  | "OTHER";

export const GCAL_TYPE_LABELS: Record<GcalVisitType, string> = {
  WELL:    "Well Visit",
  SICK:    "Sick Visit",
  BH:      "Behavioral Health",
  NEW:     "New Patient",
  NURSE:   "Nurse Visit",
  VIRTUAL: "Virtual",
  OTHER:   "Other",
};

export interface ClassifiedGcalEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink: string;
  visitType: GcalVisitType;
  noShow: boolean;
  cleanTitle: string;
}

// ─── Classification (mirrors appointments page parsing) ──────────────────────

export function cleanGcalSummary(raw: string): string {
  return raw
    .replace(/\*{1,2}[^*]*\*{1,2}/g, "")
    .replace(/\+[^+]+\+/g, "")
    .replace(/\s*[-–]\s*(BH|WELL|SICK|NEW|GAC|NURSE|MIGDAS|Migdas|VIRTUAL|Virtual Visit|Virtual)\b.*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyGcalEvent(e: {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink: string;
}): ClassifiedGcalEvent {
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
    cleanTitle: cleanGcalSummary(raw) || raw,
  };
}

// ─── Token management ─────────────────────────────────────────────────────────

async function getValidToken(): Promise<string | null> {
  const s = await prisma.settings.findFirst();
  if (!s?.googleCalAccessToken || !s?.googleCalRefreshToken) return null;

  const expiry = s.googleCalTokenExpiry;
  const isExpired = !expiry || expiry <= new Date(Date.now() + 60_000);

  if (!isExpired) return decrypt(s.googleCalAccessToken);

  if (!s.googleCalClientId || !s.googleCalClientSecret) return null;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: decrypt(s.googleCalClientId),
      client_secret: decrypt(s.googleCalClientSecret),
      refresh_token: decrypt(s.googleCalRefreshToken),
      grant_type: "refresh_token",
    }),
  });

  const data = await tokenRes.json();
  if (!tokenRes.ok || !data.access_token) return null;

  await prisma.settings.update({
    where: { id: s.id },
    data: {
      googleCalAccessToken: encrypt(data.access_token),
      googleCalTokenExpiry: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
      googleCalLastSync: new Date(),
    },
  });

  return data.access_token;
}

// ─── Server-side event fetch (paginated) ──────────────────────────────────────

export async function fetchGcalEvents(
  timeMin: Date,
  timeMax: Date,
): Promise<{ connected: boolean; events: ClassifiedGcalEvent[] }> {
  const s = await prisma.settings.findFirst();
  if (!s?.googleCalEnabled) return { connected: false, events: [] };

  const token = await getValidToken();
  if (!token) return { connected: false, events: [] };

  const calendarId = encodeURIComponent(s.googleCalCalendarId ?? "primary");
  const events: ClassifiedGcalEvent[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    );
    url.searchParams.set("timeMin", timeMin.toISOString());
    url.searchParams.set("timeMax", timeMax.toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "2500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.error("[lib/google-calendar] fetch failed", res.status);
      break;
    }

    const data = await res.json();
    for (const e of data.items ?? []) {
      events.push(
        classifyGcalEvent({
          id: e.id,
          summary: e.summary ?? "(No title)",
          start: e.start?.dateTime ?? e.start?.date,
          end: e.end?.dateTime ?? e.end?.date,
          allDay: !e.start?.dateTime,
          htmlLink: e.htmlLink,
        }),
      );
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return { connected: true, events };
}
