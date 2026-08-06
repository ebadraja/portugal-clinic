-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'AWAITING_REPLY', 'RESOLVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MessageSenderType" AS ENUM ('PATIENT', 'STAFF', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'WEB_CHAT', 'PORTAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageContentType" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'FORM_LINK', 'SYSTEM_EVENT');

-- CreateEnum
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "MessagingTriggerEvent" AS ENUM ('APPOINTMENT_REMINDER', 'APPOINTMENT_CONFIRMED', 'APPOINTMENT_CANCELLED', 'NO_SHOW', 'POST_VISIT', 'NEW_PATIENT', 'INTAKE_FORM_DUE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MessageReason" AS ENUM ('SCHEDULING', 'REFILL', 'QUESTION', 'URGENT', 'INSURANCE', 'RECORDS', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'MESSAGE_SENT';
ALTER TYPE "AuditAction" ADD VALUE 'MESSAGE_READ';
ALTER TYPE "AuditAction" ADD VALUE 'CONVERSATION_ASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE 'CONVERSATION_RESOLVED';
ALTER TYPE "AuditAction" ADD VALUE 'PORTAL_ACCESS';
ALTER TYPE "AuditAction" ADD VALUE 'BROADCAST_SENT';

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "sms_opt_out" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "default_routing_rules" JSONB,
ADD COLUMN     "messaging_business_hours" JSONB,
ADD COLUMN     "messaging_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "portal_config" JSONB,
ADD COLUMN     "sms_provider_config" JSONB,
ADD COLUMN     "web_chat_widget_config" JSONB;

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_to_id" TEXT,
    "assigned_inbox_id" TEXT,
    "last_message_at" TIMESTAMP(3),
    "last_message_preview" TEXT,
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "reason" "MessageReason",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_type" "MessageSenderType" NOT NULL,
    "sender_id" TEXT,
    "channel" "MessageChannel" NOT NULL,
    "content" TEXT NOT NULL,
    "content_type" "MessageContentType" NOT NULL DEFAULT 'TEXT',
    "delivery_status" "MessageDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "external_message_id" TEXT,
    "is_internal_note" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_inboxes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_inboxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_inbox_members" (
    "id" TEXT NOT NULL,
    "shared_inbox_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_inbox_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'BOTH',
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT NOT NULL,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_automation_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger_event" "MessagingTriggerEvent" NOT NULL,
    "delay_minutes" INTEGER NOT NULL DEFAULT 0,
    "template_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'BOTH',
    "conditions" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_assignment_logs" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "from_user_id" TEXT,
    "to_user_id" TEXT,
    "to_inbox_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_assignment_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_portal_sessions" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "device_fingerprint" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_portal_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "segment_filters" JSONB,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "delivered_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_opt_outs" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "opted_out_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opted_in_at" TIMESTAMP(3),
    "is_opted_out" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sms_opt_outs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_patient_id_key" ON "conversations"("patient_id");

-- CreateIndex
CREATE INDEX "conversations_status_assigned_to_id_idx" ON "conversations"("status", "assigned_to_id");

-- CreateIndex
CREATE INDEX "conversations_last_message_at_idx" ON "conversations"("last_message_at" DESC);

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_external_message_id_idx" ON "messages"("external_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "shared_inbox_members_shared_inbox_id_user_id_key" ON "shared_inbox_members"("shared_inbox_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_portal_sessions_token_key" ON "patient_portal_sessions"("token");

-- CreateIndex
CREATE INDEX "patient_portal_sessions_patient_id_expires_at_idx" ON "patient_portal_sessions"("patient_id", "expires_at");

-- CreateIndex
CREATE INDEX "sms_opt_outs_phone_number_idx" ON "sms_opt_outs"("phone_number");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_inbox_id_fkey" FOREIGN KEY ("assigned_inbox_id") REFERENCES "shared_inboxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_inbox_members" ADD CONSTRAINT "shared_inbox_members_shared_inbox_id_fkey" FOREIGN KEY ("shared_inbox_id") REFERENCES "shared_inboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_inbox_members" ADD CONSTRAINT "shared_inbox_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_automation_rules" ADD CONSTRAINT "messaging_automation_rules_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_assignment_logs" ADD CONSTRAINT "conversation_assignment_logs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_portal_sessions" ADD CONSTRAINT "patient_portal_sessions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_opt_outs" ADD CONSTRAINT "sms_opt_outs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
