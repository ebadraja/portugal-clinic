-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF', 'VIEWER');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('WELL_CHILD_VISIT', 'SICK_VISIT', 'VACCINATION', 'FOLLOW_UP', 'CONSULTATION', 'PROCEDURE', 'OTHER');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('STAFF', 'VOICE_AGENT', 'CHATBOT', 'WEBSITE', 'WALK_IN');

-- CreateEnum
CREATE TYPE "CallIntent" AS ENUM ('APPOINTMENT_BOOKING', 'INQUIRY', 'COMPLAINT', 'SUPPORT', 'ROUTING', 'CANCELLATION', 'VERIFICATION', 'EMERGENCY', 'GENERAL');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('IN_PROGRESS', 'BOOKED', 'INFO_PROVIDED', 'TRANSFERRED', 'HUNG_UP', 'VOICEMAIL');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "ChatTopic" AS ENUM ('APPOINTMENT', 'PRICING', 'INSURANCE', 'HOURS', 'SERVICES', 'LOCATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ChatOutcome" AS ENUM ('IN_PROGRESS', 'BOOKED', 'INFO_PROVIDED', 'ESCALATED_TO_CALL', 'LEAD_CAPTURED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('GENERAL', 'MEDICAL', 'ADMINISTRATIVE', 'FOLLOW_UP', 'ALERT');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('INTAKE_FORM', 'MEDICAL_RECORD', 'INSURANCE', 'CONSENT', 'LAB_RESULT', 'IMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT');

-- CreateEnum
CREATE TYPE "IntakeFormStatus" AS ENUM ('RECEIVED', 'MATCHED', 'DRAFT', 'LINKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('PENDING', 'READY_FOR_APPROVAL', 'APPROVED', 'REJECTED', 'PUBLISHED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "job_title" TEXT,
    "phone" TEXT,
    "avatar" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_secret" TEXT,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "date_of_birth" TIMESTAMP(3) NOT NULL,
    "gender" "Gender",
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip_code" TEXT,
    "parent_name" TEXT,
    "parent_relation" TEXT,
    "parent_phone" TEXT,
    "parent_email" TEXT,
    "emergency_contact" TEXT,
    "emergency_phone" TEXT,
    "insurance_provider" TEXT,
    "insurance_id" TEXT,
    "allergies" TEXT,
    "medications" TEXT,
    "medical_notes" TEXT,
    "preferred_language" TEXT NOT NULL DEFAULT 'English',
    "preferred_provider" TEXT,
    "status" "PatientStatus" NOT NULL DEFAULT 'ACTIVE',
    "total_visits" INTEGER NOT NULL DEFAULT 0,
    "last_visit_at" TIMESTAMP(3),
    "patient_since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL,
    "type" "AppointmentType" NOT NULL DEFAULT 'OTHER',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "provider" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_via" TEXT,
    "reminders_sent" INTEGER NOT NULL DEFAULT 0,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "booked_via" "BookingSource" NOT NULL DEFAULT 'STAFF',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_logs" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT,
    "caller_name" TEXT,
    "caller_phone" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
    "duration" INTEGER,
    "intent" "CallIntent" NOT NULL DEFAULT 'GENERAL',
    "outcome" "CallOutcome" NOT NULL DEFAULT 'IN_PROGRESS',
    "sentiment" "Sentiment" NOT NULL DEFAULT 'NEUTRAL',
    "transcript" TEXT,
    "summary" TEXT,
    "recording_url" TEXT,
    "appointment_booked" BOOLEAN NOT NULL DEFAULT false,
    "appointment_id" TEXT,
    "was_escalated" BOOLEAN NOT NULL DEFAULT false,
    "escalation_reason" TEXT,
    "transferred_to" TEXT,
    "vapi_call_id" TEXT,
    "is_reviewed" BOOLEAN NOT NULL DEFAULT false,
    "flag_for_follow_up" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_logs" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT,
    "visitor_name" TEXT,
    "visitor_email" TEXT,
    "visitor_phone" TEXT,
    "session_id" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "topic" "ChatTopic" NOT NULL DEFAULT 'OTHER',
    "outcome" "ChatOutcome" NOT NULL DEFAULT 'IN_PROGRESS',
    "messages" JSONB NOT NULL,
    "summary" TEXT,
    "source_page" TEXT,
    "device_type" TEXT,
    "browser" TEXT,
    "appointment_booked" BOOLEAN NOT NULL DEFAULT false,
    "appointment_id" TEXT,
    "lead_captured" BOOLEAN NOT NULL DEFAULT false,
    "lead_info" JSONB,
    "is_reviewed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_notes" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "note_type" "NoteType" NOT NULL DEFAULT 'GENERAL',
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "practice_name" TEXT NOT NULL DEFAULT 'Kids 0-18 Integrated Pediatrics',
    "practice_tagline" TEXT,
    "practice_phone" TEXT,
    "practice_email" TEXT,
    "practice_address" TEXT,
    "practice_website" TEXT,
    "business_hours" JSONB,
    "lunch_break" JSONB,
    "holidays" JSONB,
    "voice_agent_enabled" BOOLEAN NOT NULL DEFAULT false,
    "voice_agent_name" TEXT NOT NULL DEFAULT 'Jenny',
    "voice_provider" TEXT NOT NULL DEFAULT '11labs',
    "voice_id" TEXT,
    "greeting_message" TEXT,
    "tone_slider" INTEGER NOT NULL DEFAULT 50,
    "speed_slider" INTEGER NOT NULL DEFAULT 50,
    "empathy_slider" INTEGER NOT NULL DEFAULT 50,
    "emergency_phone" TEXT,
    "chatbot_enabled" BOOLEAN NOT NULL DEFAULT false,
    "chatbot_welcome_msg" TEXT,
    "chatbot_position" TEXT NOT NULL DEFAULT 'bottom-right',
    "chatbot_theme" TEXT NOT NULL DEFAULT 'blue',
    "auto_trigger_seconds" INTEGER NOT NULL DEFAULT 0,
    "notification_email" TEXT,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_new_booking" BOOLEAN NOT NULL DEFAULT true,
    "email_cancellation" BOOLEAN NOT NULL DEFAULT true,
    "email_escalation" BOOLEAN NOT NULL DEFAULT true,
    "email_new_patient" BOOLEAN NOT NULL DEFAULT true,
    "email_daily_summary" BOOLEAN NOT NULL DEFAULT false,
    "email_weekly_analytics" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_required" BOOLEAN NOT NULL DEFAULT false,
    "session_timeout" INTEGER NOT NULL DEFAULT 30,
    "appointment_types" JSONB,
    "integrations" JSONB,
    "hippatiz_enabled" BOOLEAN NOT NULL DEFAULT false,
    "hippatiz_api_key" TEXT,
    "hippatiz_webhook_secret" TEXT,
    "hippatiz_webhook_url" TEXT,
    "hippatiz_last_sync" TIMESTAMP(3),
    "hippatiz_form_templates" JSONB,
    "hippatiz_account_id" TEXT,
    "hippatiz_user_id" TEXT,
    "intake_form_notify_email" TEXT,
    "intake_form_notify_on_new_form" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" "AuditAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "changes" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_items" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "times_asked" INTEGER NOT NULL DEFAULT 0,
    "last_asked_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "source_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_forms" (
    "id" TEXT NOT NULL,
    "hippatizer_id" TEXT NOT NULL,
    "hippatiz_form_id" TEXT NOT NULL,
    "hippatiz_form_title" TEXT NOT NULL,
    "patient_id" TEXT,
    "patient_draft_id" TEXT,
    "status" "IntakeFormStatus" NOT NULL DEFAULT 'RECEIVED',
    "match_confidence" DOUBLE PRECISION,
    "match_notes" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "linked_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "processed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intake_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_form_field_values" (
    "id" TEXT NOT NULL,
    "intake_form_id" TEXT NOT NULL,
    "field_id" TEXT NOT NULL,
    "field_label" TEXT,
    "field_type" TEXT NOT NULL,
    "value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_form_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_drafts" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "date_of_birth" TIMESTAMP(3) NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "middle_initial" TEXT,
    "gender" TEXT,
    "preferred_pronouns" TEXT,
    "preferred_language" TEXT,
    "street_address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip_code" TEXT,
    "caregiver1_first_name" TEXT,
    "caregiver1_last_name" TEXT,
    "caregiver1_relationship" TEXT,
    "caregiver1_phone" TEXT,
    "caregiver1_email" TEXT,
    "caregiver2_first_name" TEXT,
    "caregiver2_last_name" TEXT,
    "caregiver2_relationship" TEXT,
    "caregiver2_phone" TEXT,
    "caregiver2_email" TEXT,
    "pcp_name" TEXT,
    "pcp_clinic_name" TEXT,
    "pcp_phone" TEXT,
    "status" "DraftStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3),
    "published_by_id" TEXT,

    CONSTRAINT "patient_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_form_field_mappings" (
    "id" TEXT NOT NULL,
    "hippatiz_form_id" TEXT NOT NULL,
    "form_title" TEXT NOT NULL,
    "mappings" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intake_form_field_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_form_access_controls" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "can_view" BOOLEAN NOT NULL DEFAULT false,
    "can_match" BOOLEAN NOT NULL DEFAULT false,
    "can_publish" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intake_form_access_controls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "patients_phone_idx" ON "patients"("phone");

-- CreateIndex
CREATE INDEX "patients_last_name_first_name_idx" ON "patients"("last_name", "first_name");

-- CreateIndex
CREATE INDEX "appointments_start_time_idx" ON "appointments"("start_time");

-- CreateIndex
CREATE INDEX "appointments_status_idx" ON "appointments"("status");

-- CreateIndex
CREATE INDEX "appointments_patient_id_idx" ON "appointments"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "call_logs_appointment_id_key" ON "call_logs"("appointment_id");

-- CreateIndex
CREATE UNIQUE INDEX "call_logs_vapi_call_id_key" ON "call_logs"("vapi_call_id");

-- CreateIndex
CREATE INDEX "call_logs_start_time_idx" ON "call_logs"("start_time");

-- CreateIndex
CREATE INDEX "call_logs_caller_phone_idx" ON "call_logs"("caller_phone");

-- CreateIndex
CREATE INDEX "call_logs_patient_id_idx" ON "call_logs"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_logs_session_id_key" ON "chat_logs"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_logs_appointment_id_key" ON "chat_logs"("appointment_id");

-- CreateIndex
CREATE INDEX "chat_logs_start_time_idx" ON "chat_logs"("start_time");

-- CreateIndex
CREATE INDEX "chat_logs_session_id_idx" ON "chat_logs"("session_id");

-- CreateIndex
CREATE INDEX "patient_notes_patient_id_idx" ON "patient_notes"("patient_id");

-- CreateIndex
CREATE INDEX "documents_patient_id_idx" ON "documents"("patient_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "knowledge_items_category_idx" ON "knowledge_items"("category");

-- CreateIndex
CREATE UNIQUE INDEX "intake_forms_hippatizer_id_key" ON "intake_forms"("hippatizer_id");

-- CreateIndex
CREATE INDEX "intake_forms_patient_id_idx" ON "intake_forms"("patient_id");

-- CreateIndex
CREATE INDEX "intake_forms_patient_draft_id_idx" ON "intake_forms"("patient_draft_id");

-- CreateIndex
CREATE INDEX "intake_forms_status_idx" ON "intake_forms"("status");

-- CreateIndex
CREATE INDEX "intake_forms_submitted_at_idx" ON "intake_forms"("submitted_at");

-- CreateIndex
CREATE INDEX "intake_form_field_values_intake_form_id_idx" ON "intake_form_field_values"("intake_form_id");

-- CreateIndex
CREATE INDEX "intake_form_field_values_field_id_idx" ON "intake_form_field_values"("field_id");

-- CreateIndex
CREATE INDEX "patient_drafts_status_idx" ON "patient_drafts"("status");

-- CreateIndex
CREATE INDEX "patient_drafts_created_at_idx" ON "patient_drafts"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "intake_form_field_mappings_hippatiz_form_id_key" ON "intake_form_field_mappings"("hippatiz_form_id");

-- CreateIndex
CREATE UNIQUE INDEX "intake_form_access_controls_user_id_key" ON "intake_form_access_controls"("user_id");

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_logs" ADD CONSTRAINT "chat_logs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_logs" ADD CONSTRAINT "chat_logs_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_notes" ADD CONSTRAINT "patient_notes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_notes" ADD CONSTRAINT "patient_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_forms" ADD CONSTRAINT "intake_forms_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_forms" ADD CONSTRAINT "intake_forms_patient_draft_id_fkey" FOREIGN KEY ("patient_draft_id") REFERENCES "patient_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_forms" ADD CONSTRAINT "intake_forms_processed_by_id_fkey" FOREIGN KEY ("processed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_form_field_values" ADD CONSTRAINT "intake_form_field_values_intake_form_id_fkey" FOREIGN KEY ("intake_form_id") REFERENCES "intake_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_drafts" ADD CONSTRAINT "patient_drafts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_drafts" ADD CONSTRAINT "patient_drafts_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_form_access_controls" ADD CONSTRAINT "intake_form_access_controls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
