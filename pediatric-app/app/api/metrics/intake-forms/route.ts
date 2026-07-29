/**
 * GET /api/metrics/intake-forms
 * Provides analytics and metrics for intake forms
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check access
    const accessControl = await prisma.intakeFormAccessControl.findUnique({
      where: { userId: session.user.id },
    });

    if (session.user.role !== "ADMIN" && !accessControl?.canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get all forms for analysis
    const allForms = await prisma.intakeForm.findMany({
      select: {
        id: true,
        status: true,
        matchConfidence: true,
        hippatizFormTitle: true,
        submittedAt: true,
        linkedAt: true,
        processedAt: true,
        createdAt: true,
      },
    });

    // Calculate metrics
    const totalForms = allForms.length;
    
    // Status breakdown
    const statusBreakdown = {
      RECEIVED: allForms.filter((f) => f.status === "RECEIVED").length,
      MATCHED: allForms.filter((f) => f.status === "MATCHED").length,
      DRAFT: allForms.filter((f) => f.status === "DRAFT").length,
      LINKED: allForms.filter((f) => f.status === "LINKED").length,
      ARCHIVED: allForms.filter((f) => f.status === "ARCHIVED").length,
    };

    // Form types breakdown
    const formTypeMap = new Map<string, number>();
    allForms.forEach((f) => {
      formTypeMap.set(
        f.hippatizFormTitle,
        (formTypeMap.get(f.hippatizFormTitle) || 0) + 1
      );
    });
    const formTypeBreakdown = Array.from(formTypeMap).map(([title, count]) => ({
      title,
      count,
    }));

    // Match confidence stats
    const formsWithConfidence = allForms.filter((f) => f.matchConfidence !== null);
    const avgMatchConfidence =
      formsWithConfidence.length > 0
        ? (
            formsWithConfidence.reduce(
              (sum, f) => sum + (f.matchConfidence || 0),
              0
            ) / formsWithConfidence.length
          ) * 100
        : 0;

    const matchRateOver85 = formsWithConfidence.filter(
      (f) => (f.matchConfidence || 0) >= 0.85
    ).length;

    // Processing time analysis (in minutes)
    const formsWithProcessingTime = allForms.filter(
      (f) => f.submittedAt && f.processedAt
    );
    const avgProcessingTime =
      formsWithProcessingTime.length > 0
        ? (
            formsWithProcessingTime.reduce((sum, f) => {
              const diffMs =
                (f.processedAt?.getTime() || 0) -
                f.submittedAt.getTime();
              return sum + diffMs / 60000; // Convert to minutes
            }, 0) / formsWithProcessingTime.length
          ).toFixed(2)
        : "0";

    // Forms submitted over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const formsLast30Days = allForms.filter(
      (f) => f.submittedAt >= thirtyDaysAgo
    );

    const dailyData = new Map<string, number>();
    formsLast30Days.forEach((f) => {
      const dateStr = f.submittedAt.toISOString().split("T")[0];
      dailyData.set(dateStr, (dailyData.get(dateStr) || 0) + 1);
    });

    const submissionTrend = Array.from(dailyData)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Match confidence distribution (bucketed)
    const confidenceBuckets = {
      "0-25": 0,
      "25-50": 0,
      "50-75": 0,
      "75-85": 0,
      "85-100": 0,
      "No Match": 0,
    };

    formsWithConfidence.forEach((f) => {
      const conf = f.matchConfidence || 0;
      if (conf === 0) confidenceBuckets["No Match"]++;
      else if (conf < 0.25) confidenceBuckets["0-25"]++;
      else if (conf < 0.5) confidenceBuckets["25-50"]++;
      else if (conf < 0.75) confidenceBuckets["50-75"]++;
      else if (conf < 0.85) confidenceBuckets["75-85"]++;
      else confidenceBuckets["85-100"]++;
    });

    // Get unique form types for filtering
    const uniqueFormTypes = Array.from(
      new Set(allForms.map((f) => f.hippatizFormTitle))
    );

    return NextResponse.json({
      summary: {
        totalForms,
        totalReceived: formsLast30Days.length,
        statusBreakdown,
        averageMatchConfidence: parseFloat(avgMatchConfidence.toFixed(2)),
        matchRateOver85,
        averageProcessingTimeMinutes: parseFloat(avgProcessingTime as string),
      },
      trends: {
        submissionTrend,
        formTypeBreakdown,
        confidenceDistribution: confidenceBuckets,
      },
      reference: {
        uniqueFormTypes,
      },
    });
  } catch (error) {
    console.error("Error fetching metrics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
