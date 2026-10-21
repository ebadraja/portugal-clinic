-- Vapi API connection (Settings). Additive only.
-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "vapi_api_key" TEXT,
ADD COLUMN     "vapi_assistant_id" TEXT,
ADD COLUMN     "vapi_last_sync" TIMESTAMP(3),
ADD COLUMN     "vapi_phone_number_id" TEXT;
