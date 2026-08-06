-- CreateEnum
CREATE TYPE "EmailTemplateType" AS ENUM ('TRANSACTIONAL', 'BULK', 'AUTOMATED');

-- CreateEnum
CREATE TYPE "EmailCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmailLogType" AS ENUM ('REMINDER', 'CAMPAIGN', 'AUTOMATED');

-- CreateEnum
CREATE TYPE "EmailLogStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'FAILED', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "EmailTriggerEvent" AS ENUM ('APPOINTMENT_CREATED', 'APPOINTMENT_UPDATED', 'APPOINTMENT_CANCELLED', 'X_DAYS_BEFORE', 'X_DAYS_AFTER', 'PATIENT_CREATED');

-- AlterTable
ALTER TABLE "intake_forms" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "hippatiz_pdf_link" TEXT,
ADD COLUMN     "hippatiz_view_link" TEXT;

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "insurance_member_id" TEXT,
ADD COLUMN     "insurance_plan" TEXT,
ADD COLUMN     "insurance_plan_type" TEXT;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "google_cal_access_token" TEXT,
ADD COLUMN     "google_cal_calendar_id" TEXT DEFAULT 'primary',
ADD COLUMN     "google_cal_client_id" TEXT,
ADD COLUMN     "google_cal_client_secret" TEXT,
ADD COLUMN     "google_cal_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "google_cal_last_sync" TIMESTAMP(3),
ADD COLUMN     "google_cal_refresh_token" TEXT,
ADD COLUMN     "google_cal_sync_direction" TEXT NOT NULL DEFAULT 'read_only',
ADD COLUMN     "google_cal_token_expiry" TIMESTAMP(3),
ALTER COLUMN "practice_name" SET DEFAULT 'Clínica Dentária Nunes Monteiro';

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EmailTemplateType" NOT NULL,
    "subject" TEXT NOT NULL,
    "html_body" TEXT NOT NULL,
    "plain_body" TEXT,
    "variables" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "status" "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "segment_filters" JSONB,
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "patient_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "type" "EmailLogType" NOT NULL,
    "to_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailLogStatus" NOT NULL DEFAULT 'QUEUED',
    "sent_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "clicked_at" TIMESTAMP(3),
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_automation_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "trigger_event" "EmailTriggerEvent" NOT NULL,
    "trigger_offset_hours" INTEGER,
    "conditions" JSONB,
    "template_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unsubscribes" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "unsubscribed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "unsubscribes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_templates_type_idx" ON "email_templates"("type");

-- CreateIndex
CREATE INDEX "email_templates_is_active_idx" ON "email_templates"("is_active");

-- CreateIndex
CREATE INDEX "email_campaigns_status_idx" ON "email_campaigns"("status");

-- CreateIndex
CREATE INDEX "email_campaigns_scheduled_at_idx" ON "email_campaigns"("scheduled_at");

-- CreateIndex
CREATE INDEX "email_campaigns_created_by_id_idx" ON "email_campaigns"("created_by_id");

-- CreateIndex
CREATE INDEX "email_logs_patient_id_idx" ON "email_logs"("patient_id");

-- CreateIndex
CREATE INDEX "email_logs_campaign_id_idx" ON "email_logs"("campaign_id");

-- CreateIndex
CREATE INDEX "email_logs_status_idx" ON "email_logs"("status");

-- CreateIndex
CREATE INDEX "email_logs_created_at_idx" ON "email_logs"("created_at");

-- CreateIndex
CREATE INDEX "email_automation_rules_is_active_idx" ON "email_automation_rules"("is_active");

-- CreateIndex
CREATE INDEX "email_automation_rules_trigger_event_idx" ON "email_automation_rules"("trigger_event");

-- CreateIndex
CREATE INDEX "unsubscribes_unsubscribed_at_idx" ON "unsubscribes"("unsubscribed_at");

-- CreateIndex
CREATE UNIQUE INDEX "unsubscribes_patient_id_key" ON "unsubscribes"("patient_id");

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "email_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_automation_rules" ADD CONSTRAINT "email_automation_rules_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unsubscribes" ADD CONSTRAINT "unsubscribes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
