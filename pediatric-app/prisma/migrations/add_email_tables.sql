-- ─────────────────────────────────────────────────────────────────────────────
-- Email System Tables Migration
-- Project  : Kids 0-18 Integrated Pediatrics CRM
-- Database : PostgreSQL (Supabase)
-- Notes    : IDs use cuid() (text) to match existing schema convention.
--            Encrypted fields (to_email, email) are encrypted at the
--            application layer via lib/crypto.ts — stored as plain text here.
--            Run via: psql $DATABASE_URL -f this_file.sql
--            OR let Prisma manage it: npx prisma db push
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "EmailTemplateType" AS ENUM (
  'TRANSACTIONAL',
  'BULK',
  'AUTOMATED'
);

CREATE TYPE "EmailCampaignStatus" AS ENUM (
  'DRAFT',
  'SCHEDULED',
  'SENDING',
  'SENT',
  'PAUSED',
  'CANCELLED'
);

CREATE TYPE "EmailLogType" AS ENUM (
  'REMINDER',
  'CAMPAIGN',
  'AUTOMATED'
);

CREATE TYPE "EmailLogStatus" AS ENUM (
  'QUEUED',
  'SENT',
  'DELIVERED',
  'OPENED',
  'CLICKED',
  'BOUNCED',
  'FAILED',
  'UNSUBSCRIBED'
);

CREATE TYPE "EmailTriggerEvent" AS ENUM (
  'APPOINTMENT_CREATED',
  'APPOINTMENT_UPDATED',
  'APPOINTMENT_CANCELLED',
  'X_DAYS_BEFORE',
  'X_DAYS_AFTER',
  'PATIENT_CREATED'
);

-- ── email_templates ───────────────────────────────────────────────────────────

CREATE TABLE email_templates (
  id          TEXT        NOT NULL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  type        "EmailTemplateType" NOT NULL,
  subject     VARCHAR(500) NOT NULL,
  html_body   TEXT        NOT NULL,
  plain_body  TEXT,
  variables   JSONB,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_templates_type     ON email_templates (type);
CREATE INDEX idx_email_templates_active   ON email_templates (is_active);

-- ── email_campaigns ───────────────────────────────────────────────────────────

CREATE TABLE email_campaigns (
  id               TEXT        NOT NULL PRIMARY KEY,
  name             VARCHAR(255) NOT NULL,
  template_id      TEXT        NOT NULL REFERENCES email_templates(id),
  status           "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  scheduled_at     TIMESTAMPTZ,
  sent_at          TIMESTAMPTZ,
  segment_filters  JSONB,
  recipient_count  INTEGER     NOT NULL DEFAULT 0,
  created_by_id    TEXT        NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_campaigns_status       ON email_campaigns (status);
CREATE INDEX idx_email_campaigns_scheduled_at ON email_campaigns (scheduled_at);
CREATE INDEX idx_email_campaigns_created_by   ON email_campaigns (created_by_id);

-- ── email_logs ────────────────────────────────────────────────────────────────

CREATE TABLE email_logs (
  id            TEXT        NOT NULL PRIMARY KEY,
  campaign_id   TEXT        REFERENCES email_campaigns(id),
  patient_id    TEXT        NOT NULL REFERENCES patients(id),
  template_id   TEXT        NOT NULL REFERENCES email_templates(id),
  type          "EmailLogType"   NOT NULL,
  to_email      VARCHAR(255) NOT NULL,        -- encrypted at app layer
  subject       VARCHAR(500) NOT NULL,
  status        "EmailLogStatus" NOT NULL DEFAULT 'QUEUED',
  sent_at       TIMESTAMPTZ,
  opened_at     TIMESTAMPTZ,
  clicked_at    TIMESTAMPTZ,
  error_message TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_logs_patient_id  ON email_logs (patient_id);
CREATE INDEX idx_email_logs_campaign_id ON email_logs (campaign_id);
CREATE INDEX idx_email_logs_status      ON email_logs (status);
CREATE INDEX idx_email_logs_created_at  ON email_logs (created_at);

-- ── email_automation_rules ────────────────────────────────────────────────────

CREATE TABLE email_automation_rules (
  id                   TEXT        NOT NULL PRIMARY KEY,
  name                 VARCHAR(255) NOT NULL,
  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  trigger_event        "EmailTriggerEvent" NOT NULL,
  trigger_offset_hours INTEGER,               -- negative = before, positive = after
  conditions           JSONB,
  template_id          TEXT        NOT NULL REFERENCES email_templates(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_automation_active  ON email_automation_rules (is_active);
CREATE INDEX idx_email_automation_trigger ON email_automation_rules (trigger_event);

-- ── unsubscribes ──────────────────────────────────────────────────────────────

CREATE TABLE unsubscribes (
  id               TEXT        NOT NULL PRIMARY KEY,
  patient_id       TEXT        NOT NULL UNIQUE REFERENCES patients(id) ON DELETE CASCADE,
  email            VARCHAR(255) NOT NULL,    -- encrypted at app layer
  unsubscribed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason           TEXT
);

CREATE INDEX idx_unsubscribes_unsubscribed_at ON unsubscribes (unsubscribed_at);

-- ── updated_at triggers (keeps updated_at current without ORM) ────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_email_campaigns_updated_at
  BEFORE UPDATE ON email_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_email_automation_rules_updated_at
  BEFORE UPDATE ON email_automation_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
