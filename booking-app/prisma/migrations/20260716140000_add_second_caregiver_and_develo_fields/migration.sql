-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "membership_status" TEXT,
ADD COLUMN     "middle_name" TEXT,
ADD COLUMN     "parent2_email" TEXT,
ADD COLUMN     "parent2_name" TEXT,
ADD COLUMN     "parent2_relation" TEXT,
ADD COLUMN     "parent_phone2" TEXT,
ADD COLUMN     "race_ethnicity" TEXT,
ADD COLUMN     "secondary_language" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "patients_external_id_key" ON "patients"("external_id");

-- CreateIndex
CREATE INDEX "patients_parent_phone2_idx" ON "patients"("parent_phone2");
