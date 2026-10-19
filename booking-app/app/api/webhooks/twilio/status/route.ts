import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { validateWebhookSignature } from "@/lib/messaging/smsProvider"

export const dynamic = "force-dynamic"

// ── POST /api/webhooks/twilio/status — SMS delivery reports ───────────────────
// Twilio posts MessageSid + MessageStatus for each reminder (statusCallback set by the
// dispatcher). Drives the bell on the agenda card: green delivered, red failed.

const FINAL: Record<string, "delivered" | "undelivered" | "failed"> = {
  delivered: "delivered",
  undelivered: "undelivered",
  failed: "failed",
}

export async function POST(request: NextRequest) {
  try {
    if (!(await validateWebhookSignature(request.clone()))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 })
    }
    const form = await request.formData()
    const sid = String(form.get("MessageSid") ?? "")
    const status = FINAL[String(form.get("MessageStatus") ?? "").toLowerCase()]
    if (!sid || !status) return new NextResponse(null, { status: 204 })

    const row = await prisma.appointmentNotification.findUnique({ where: { providerMessageId: sid }, select: { id: true, appointmentId: true, kind: true, deliveryStatus: true } })
    if (!row || row.deliveryStatus === status) return new NextResponse(null, { status: 204 })

    await prisma.appointmentNotification.update({
      where: { id: row.id },
      data: { deliveryStatus: status, ...(status !== "delivered" && { error: `carrier: ${status} ${String(form.get("ErrorCode") ?? "")}`.trim() }) },
    })
    await prisma.appointmentEvent.create({
      data: {
        appointmentId: row.appointmentId,
        kind: status === "delivered" ? "NOTIFICATION_DELIVERED" : "NOTIFICATION_FAILED",
        actor: "SYSTEM",
        data: { notificationId: row.id, kind: row.kind, channel: "SMS", carrierStatus: status },
      },
    })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error("[POST /api/webhooks/twilio/status]", error)
    return new NextResponse(null, { status: 204 })
  }
}
