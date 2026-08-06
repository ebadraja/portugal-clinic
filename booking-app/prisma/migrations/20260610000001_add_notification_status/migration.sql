-- Add notif_status column for pending/acknowledged/completed workflow
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "notif_status" TEXT NOT NULL DEFAULT 'pending';
