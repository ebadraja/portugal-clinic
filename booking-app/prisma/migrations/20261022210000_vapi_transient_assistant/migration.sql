-- CRM-built (transient) Vapi assistant. Additive only; off by default.
-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "vapi_assistant_snapshot" JSONB,
ADD COLUMN     "vapi_preview_assistant_id" TEXT,
ADD COLUMN     "vapi_structured_output_id" TEXT,
ADD COLUMN     "vapi_transient_enabled" BOOLEAN NOT NULL DEFAULT false;
