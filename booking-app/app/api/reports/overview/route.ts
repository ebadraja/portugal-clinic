import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/auth";

const CRM_TYPE_LABELS: Record<string, string> = {
  EVALUATION:   "Evaluation",
  HYGIENE:      "Hygiene",
  RESTORATIVE:  "Restorative",
  ENDODONTICS:  "Endodontics",
  IMPLANT:      "Implant",
  ORTHODONTICS: "Orthodontics",
  AESTHETICS:   "Aesthetics",
  SURGERY:      "Surgery",
  EMERGENCY:    "Emergency",
  FOLLOW_UP:    "Follow-up",
  CONSULTATION: "Consultation",
  PROCEDURE:    "Procedure",
  OTHER:        "Other",
};

const CALL_OUTCOME_LABELS: Record<string, string> = {
  BOOKED:        "Booked",
  INFO_PROVIDED: "Info Only",
  TRANSFERRED:   "Transferred",
  HUNG_UP:       "Hung Up",
  VOICEMAIL:     "Voicemail",
  IN_PROGRESS:   "In Progress",
};

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const days = Math.min(Math.max(parseInt(searchParams.get("days") ?? "30", 10) || 30, 1), 365);

    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1), 0, 0, 0, 0);

    const [crmAppts, callLogs, messagesSent, activePatients, newPatients] =
      await Promise.all([
        prisma.appointment.findMany({
          where: { startTime: { gte: start, lte: end } },
          select: { startTime: true, type: true, status: true },
        }),
        prisma.callLog.findMany({
          where: { startTime: { gte: start, lte: end } },
          select: { startTime: true, outcome: true, wasEscalated: true, duration: true },
        }),
        // Confirmations and reminders actually sent (lib/appointments/dispatch.ts)
        prisma.appointmentNotification.groupBy({
          by: ["channel"],
          where: { status: "SENT", sentAt: { gte: start, lte: end } },
          _count: { _all: true },
        }),
        prisma.patient.count({ where: { status: "ACTIVE" } }),
        prisma.patient.count({ where: { createdAt: { gte: start, lte: end } } }),
      ]);

    // ── Time buckets (daily up to 31 days, weekly beyond) ─────────────────────
    const bucketDays = days <= 31 ? 1 : 7;
    const bucketMs = bucketDays * 86_400_000;
    const bucketCount = Math.ceil(days / bucketDays);
    const buckets = Array.from({ length: bucketCount }, (_, i) => {
      const bStart = new Date(start.getTime() + i * bucketMs);
      return { label: dayLabel(bStart), appts: 0, noShows: 0, calls: 0, escalated: 0 };
    });
    const bucketIdx = (t: number) =>
      Math.min(Math.max(Math.floor((t - start.getTime()) / bucketMs), 0), bucketCount - 1);

    // ── Aggregates ─────────────────────────────────────────────────────────────
    const typeCounts = new Map<string, number>();
    const hourCounts = new Map<number, number>();
    let noShowCount = 0;

    const addAppt = (time: Date, typeLabel: string, isNoShow: boolean) => {
      const b = buckets[bucketIdx(time.getTime())];
      b.appts += 1;
      if (isNoShow) {
        b.noShows += 1;
        noShowCount += 1;
      }
      typeCounts.set(typeLabel, (typeCounts.get(typeLabel) ?? 0) + 1);
      hourCounts.set(time.getHours(), (hourCounts.get(time.getHours()) ?? 0) + 1);
    };

    for (const a of crmAppts) {
      addAppt(
        a.startTime,
        CRM_TYPE_LABELS[a.type] ?? "Other",
        a.status === "NO_SHOW" || a.status === "CANCELLED",
      );
    }

    const outcomeCounts = new Map<string, number>();
    let escalatedCalls = 0;
    let durationSum = 0;
    let durationN = 0;
    for (const c of callLogs) {
      const b = buckets[bucketIdx(c.startTime.getTime())];
      b.calls += 1;
      if (c.wasEscalated) {
        b.escalated += 1;
        escalatedCalls += 1;
      }
      const label = CALL_OUTCOME_LABELS[c.outcome] ?? c.outcome;
      outcomeCounts.set(label, (outcomeCounts.get(label) ?? 0) + 1);
      if (c.duration) {
        durationSum += c.duration;
        durationN += 1;
      }
    }

    const totalAppointments = crmAppts.length;
    const sentBy = (channel: string) => messagesSent.find((m) => m.channel === channel)?._count._all ?? 0;

    return NextResponse.json({
      rangeDays: days,
      kpis: {
        totalAppointments,
        noShowCount,
        noShowRate:
          totalAppointments > 0
            ? parseFloat(((noShowCount / totalAppointments) * 100).toFixed(1))
            : 0,
        totalCalls: callLogs.length,
        escalatedCalls,
        avgCallDurationSeconds: durationN > 0 ? Math.round(durationSum / durationN) : 0,
        activePatients,
        newPatients,
        messagesSent: sentBy("SMS") + sentBy("EMAIL"),
      },
      apptsOverTime: buckets.map(({ label, appts, noShows }) => ({ label, appts, noShows })),
      callsOverTime: buckets.map(({ label, calls, escalated }) => ({ label, calls, escalated })),
      apptTypes: [...typeCounts.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
      peakHours: Array.from({ length: 10 }, (_, i) => {
        const h = 8 + i; // 8 AM – 5 PM
        const label = h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
        return { hour: label, count: hourCounts.get(h) ?? 0 };
      }),
      callOutcomes: [...outcomeCounts.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
      engagement: {
        calls: callLogs.length,
        sms: sentBy("SMS"),
        emails: sentBy("EMAIL"),
      },
    });
  } catch (error) {
    console.error("[GET /api/reports/overview]", error);
    return NextResponse.json({ error: "Failed to load report" }, { status: 500 });
  }
}
