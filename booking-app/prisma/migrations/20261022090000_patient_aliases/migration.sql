-- Identities of merged patient records (patient merge). Additive only.
-- CreateTable
CREATE TABLE "patient_aliases" (
    "external_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_aliases_pkey" PRIMARY KEY ("external_id")
);

-- CreateIndex
CREATE INDEX "patient_aliases_patient_id_idx" ON "patient_aliases"("patient_id");

-- AddForeignKey
ALTER TABLE "patient_aliases" ADD CONSTRAINT "patient_aliases_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
