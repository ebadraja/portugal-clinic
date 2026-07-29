/**
 * POST /api/webhooks/hippatizer/test
 * Test endpoint for webhook integration
 * Allows admin to send test payloads and verify processing
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { processWebhookPayload } from "@/app/api/webhooks/hippatizer/route";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only ADMIN can test webhooks
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { testPayload, formType } = body;

    if (!testPayload) {
      return NextResponse.json({ error: "Test payload is required" }, { status: 400 });
    }

    // Create audit log for test
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CREATE",
        entity: "webhook_test",
        changes: { formType, testRun: true },
      },
    });

    // Process the test payload (same as real webhook)
    try {
      const result = await processWebhookPayload(testPayload);

      return NextResponse.json({
        success: true,
        message: "Test webhook processed successfully",
        result,
        testMetadata: {
          formType,
          testedAt: new Date().toISOString(),
          processedBy: `${session.user.firstName} ${session.user.lastName}`,
        },
      });
    } catch (processError) {
      return NextResponse.json({
        success: false,
        error: processError instanceof Error ? processError.message : "Processing failed",
        testMetadata: {
          formType,
          testedAt: new Date().toISOString(),
          processedBy: `${session.user.firstName} ${session.user.lastName}`,
        },
      });
    }
  } catch (error) {
    console.error("Webhook test error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Return sample payloads for different form types
    const samplePayloads = {
      "Well Child Visit": {
        form_id: "form_wellchild_v1",
        submission_id: "sub_" + Math.random().toString(36).substr(2, 9),
        submission_counter: 1,
        form_title: "Well Child Visit",
        created_at: new Date().toISOString(),
        field_values: {
          patient_first_name: "Emma",
          patient_last_name: "Wilson",
          patient_dob: "2015-06-15",
          patient_gender: "Female",
          parent_name: "Sarah Wilson",
          parent_relationship: "Mother",
          parent_phone: "(555) 123-4567",
          insurance_provider: "Blue Cross",
          allergies: "Penicillin",
          current_medications: "None",
        },
      },
      "Sick Visit": {
        form_id: "form_sickvisit_v1",
        submission_id: "sub_" + Math.random().toString(36).substr(2, 9),
        submission_counter: 1,
        form_title: "Sick Visit",
        created_at: new Date().toISOString(),
        field_values: {
          patient_first_name: "James",
          patient_last_name: "Smith",
          patient_dob: "2018-03-22",
          patient_gender: "Male",
          symptoms: "Fever, cough, sore throat",
          symptom_duration: "3 days",
          fever_temp: "101.5 F",
          recent_exposure: "Exposure to flu at school",
          parent_name: "Michael Smith",
          parent_phone: "(555) 987-6543",
        },
      },
      "Vaccination Record": {
        form_id: "form_vaccination_v1",
        submission_id: "sub_" + Math.random().toString(36).substr(2, 9),
        submission_counter: 1,
        form_title: "Vaccination Record",
        created_at: new Date().toISOString(),
        field_values: {
          patient_first_name: "Olivia",
          patient_last_name: "Johnson",
          patient_dob: "2016-09-10",
          patient_gender: "Female",
          previous_vaccines: "MMR, Polio, DPT",
          vaccine_to_receive: "Flu Shot",
          known_allergies: "None",
          parent_name: "Robert Johnson",
          parent_consent: "yes",
          appointment_date: "2024-06-15",
        },
      },
    };

    return NextResponse.json({
      samplePayloads,
      instructions: {
        step1: "Select a form type from the dropdown",
        step2: "Review or modify the sample payload",
        step3: "Click 'Send Test Webhook' to process",
        step4: "Check the results to verify successful processing",
      },
    });
  } catch (error) {
    console.error("Error fetching sample payloads:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
