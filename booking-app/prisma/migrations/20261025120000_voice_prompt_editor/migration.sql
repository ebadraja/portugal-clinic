-- Editable prompt for the CRM-built Acácia. Additive only; NULL = the built-in prompt.
-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "voice_first_message_template" TEXT,
ADD COLUMN     "voice_prompt_template" TEXT;

-- CreateTable
CREATE TABLE "voice_prompt_versions" (
    "id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "first_message" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "voice_prompt_versions_created_at_idx" ON "voice_prompt_versions"("created_at");

