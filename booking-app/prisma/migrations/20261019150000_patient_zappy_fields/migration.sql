-- Zappy client fields on patients (docs/agenda: "Zappy client export -> CRM"). Additive only.
-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "birth_day" INTEGER,
ADD COLUMN     "birth_month" INTEGER,
ADD COLUMN     "consents" JSONB,
ADD COLUMN     "email_reminders_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "invoice_name" TEXT,
ADD COLUMN     "invoice_notes" TEXT,
ADD COLUMN     "phone2" TEXT,
ADD COLUMN     "phone2_note" TEXT,
ADD COLUMN     "phone_note" TEXT,
ADD COLUMN     "referred_by" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "patients_last_visit_at_idx" ON "patients"("last_visit_at");


-- GIN index for tag filters in the patient list
CREATE INDEX "patients_tags_idx" ON "patients" USING GIN ("tags");
