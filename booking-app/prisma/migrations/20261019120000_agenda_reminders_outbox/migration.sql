-- Agenda + reminders (docs/agenda/2026-10-19-zappy-replacement-plan.md). Additive only:
--   * appointments: dentist id, series, check-in, staff double-book flag, patient link token hash, import id
--   * patients: NIF, origin, SMS-reminder switch; date_of_birth becomes optional (Zappy imports)
--   * settings: agenda / reminders feature flags (off), reminder policy, dispatcher heartbeat
--   * calendar_blocks, appointment_events, appointment_notifications (outbox)
--   * BookingSource: PATIENT_LINK, IMPORT
-- AlterEnum


ALTER TYPE "BookingSource" ADD VALUE 'PATIENT_LINK';
ALTER TYPE "BookingSource" ADD VALUE 'IMPORT';

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "allowed_overlap" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checked_in_at" TIMESTAMP(3),
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "provider_id" TEXT,
ADD COLUMN     "public_token_hash" TEXT,
ADD COLUMN     "series_id" TEXT;

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "client_source" TEXT,
ADD COLUMN     "nif" TEXT,
ADD COLUMN     "sms_reminders_enabled" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "date_of_birth" DROP NOT NULL;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "agenda_v2_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dispatch_heartbeat_at" TIMESTAMP(3),
ADD COLUMN     "reminder_policy" JSONB,
ADD COLUMN     "reminders_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "calendar_blocks" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TIME_OFF',
    "reason" TEXT,
    "series_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_events" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "user_id" TEXT,
    "vapi_call_id" TEXT,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_notifications" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "send_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "provider_message_id" TEXT,
    "delivery_status" TEXT,
    "error" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_blocks_start_time_end_time_idx" ON "calendar_blocks"("start_time", "end_time");

-- CreateIndex
CREATE INDEX "calendar_blocks_series_id_idx" ON "calendar_blocks"("series_id");

-- CreateIndex
CREATE INDEX "appointment_events_appointment_id_created_at_idx" ON "appointment_events"("appointment_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_notifications_provider_message_id_key" ON "appointment_notifications"("provider_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_notifications_dedupe_key_key" ON "appointment_notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "appointment_notifications_status_send_at_idx" ON "appointment_notifications"("status", "send_at");

-- CreateIndex
CREATE INDEX "appointment_notifications_appointment_id_idx" ON "appointment_notifications"("appointment_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_public_token_hash_key" ON "appointments"("public_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_external_id_key" ON "appointments"("external_id");

-- CreateIndex
CREATE INDEX "appointments_provider_id_start_time_idx" ON "appointments"("provider_id", "start_time");

-- CreateIndex
CREATE INDEX "appointments_series_id_idx" ON "appointments"("series_id");

-- AddForeignKey
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_notifications" ADD CONSTRAINT "appointment_notifications_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_notifications" ADD CONSTRAINT "appointment_notifications_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: link existing appointments to their dentist by name (Settings.providers JSON,
-- or the built-in default dentist when providers were never saved).
UPDATE "appointments" a
SET "provider_id" = p->>'id'
FROM "settings" s, jsonb_array_elements(CASE WHEN jsonb_typeof(s."providers") = 'array' THEN s."providers" ELSE '[]'::jsonb END) p
WHERE a."provider_id" IS NULL
  AND a."provider" IS NOT NULL
  AND lower(trim(a."provider")) = lower(trim(p->>'name'));

UPDATE "appointments"
SET "provider_id" = 'ana-nunes'
WHERE "provider_id" IS NULL
  AND lower(trim("provider")) = 'dra. ana nunes'
  AND NOT EXISTS (SELECT 1 FROM "settings" WHERE jsonb_typeof("providers") = 'array');
