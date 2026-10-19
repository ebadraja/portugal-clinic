-- Clinic retrofit (playbook phases R1-R4). Additive only:
--   * settings: timezone/locale/identity/booking policy/providers/insurers/worker heartbeat
--   * users: one-time password token (invite / reset) — replaces the shared default password;
--            last TOTP step (2FA replay protection)
--   * sms_opt_outs: patient_id nullable + ON DELETE SET NULL so opt-outs outlive the patient record
--   * voice_webhook_events: delivery log (metadata only)
--   * callback_requests: callback work queue

-- CreateEnum
CREATE TYPE "CallbackStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CallbackUrgency" AS ENUM ('LOW', 'NORMAL', 'URGENT');

-- DropForeignKey
ALTER TABLE "sms_opt_outs" DROP CONSTRAINT "sms_opt_outs_patient_id_fkey";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_token_expires_at" TIMESTAMP(3),
ADD COLUMN     "password_token_hash" TEXT,
ADD COLUMN     "password_token_purpose" TEXT,
ADD COLUMN     "two_factor_last_step" INTEGER;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "booking_policy" JSONB,
ADD COLUMN     "clinic_identity" JSONB,
ADD COLUMN     "insurers" JSONB,
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'pt-PT',
ADD COLUMN     "providers" JSONB,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Lisbon',
ADD COLUMN     "voice_tools_paused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "worker_heartbeat_at" TIMESTAMP(3),
ALTER COLUMN "voice_agent_name" SET DEFAULT 'Acácia';

-- AlterTable
ALTER TABLE "sms_opt_outs" ALTER COLUMN "patient_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "voice_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'vapi',
    "event_type" TEXT NOT NULL,
    "call_id" TEXT,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "callback_requests" (
    "id" TEXT NOT NULL,
    "caller_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "urgency" "CallbackUrgency" NOT NULL DEFAULT 'NORMAL',
    "is_new_patient" BOOLEAN NOT NULL DEFAULT false,
    "source" "BookingSource" NOT NULL DEFAULT 'VOICE_AGENT',
    "status" "CallbackStatus" NOT NULL DEFAULT 'OPEN',
    "patient_id" TEXT,
    "assigned_to_id" TEXT,
    "vapi_call_id" TEXT,
    "due_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "callback_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "voice_webhook_events_received_at_idx" ON "voice_webhook_events"("received_at");

-- CreateIndex
CREATE INDEX "voice_webhook_events_outcome_received_at_idx" ON "voice_webhook_events"("outcome", "received_at");

-- CreateIndex
CREATE INDEX "callback_requests_status_urgency_idx" ON "callback_requests"("status", "urgency");

-- CreateIndex
CREATE INDEX "callback_requests_created_at_idx" ON "callback_requests"("created_at");

-- AddForeignKey
ALTER TABLE "sms_opt_outs" ADD CONSTRAINT "sms_opt_outs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "callback_requests" ADD CONSTRAINT "callback_requests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "callback_requests" ADD CONSTRAINT "callback_requests_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
