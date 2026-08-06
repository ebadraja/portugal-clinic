-- Gmail email sending settings (reuses the Google OAuth client / Cloud project)
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "gmail_access_token" TEXT;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "gmail_refresh_token" TEXT;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "gmail_token_expiry" TIMESTAMP(3);
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "gmail_sender_email" TEXT;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "gmail_from_name" TEXT;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "gmail_enabled" BOOLEAN NOT NULL DEFAULT false;
