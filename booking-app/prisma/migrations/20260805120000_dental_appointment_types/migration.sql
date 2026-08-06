-- Phase 4: Replace pediatric AppointmentType values with dental clinic types.
-- Single-step recreate avoids Postgres "new enum value can't be used yet" transaction limits.

CREATE TYPE "AppointmentType_new" AS ENUM (
  'EVALUATION',
  'HYGIENE',
  'RESTORATIVE',
  'ENDODONTICS',
  'IMPLANT',
  'ORTHODONTICS',
  'AESTHETICS',
  'SURGERY',
  'EMERGENCY',
  'FOLLOW_UP',
  'CONSULTATION',
  'PROCEDURE',
  'OTHER'
);

ALTER TABLE "appointments" ALTER COLUMN "type" DROP DEFAULT;

ALTER TABLE "appointments"
  ALTER COLUMN "type" TYPE "AppointmentType_new"
  USING (
    CASE "type"::text
      WHEN 'WELL_CHILD_VISIT' THEN 'EVALUATION'
      WHEN 'SICK_VISIT' THEN 'EMERGENCY'
      WHEN 'VACCINATION' THEN 'OTHER'
      ELSE "type"::text
    END
  )::"AppointmentType_new";

ALTER TABLE "appointments"
  ALTER COLUMN "type" SET DEFAULT 'OTHER'::"AppointmentType_new";

DROP TYPE "AppointmentType";
ALTER TYPE "AppointmentType_new" RENAME TO "AppointmentType";
