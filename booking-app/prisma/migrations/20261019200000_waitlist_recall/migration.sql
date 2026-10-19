-- Agenda waiting list and check-up recall snooze. Additive only.
-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "recall_snoozed_until" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "type" "AppointmentType",
    "provider_id" TEXT,
    "from_date" TEXT NOT NULL,
    "until_date" TEXT,
    "time_of_day" TEXT NOT NULL DEFAULT 'ANY',
    "notes" TEXT,
    "current_appointment_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "booked_appointment_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "waitlist_entries_status_from_date_idx" ON "waitlist_entries"("status", "from_date");

-- CreateIndex
CREATE INDEX "waitlist_entries_patient_id_idx" ON "waitlist_entries"("patient_id");

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
