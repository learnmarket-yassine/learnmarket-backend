-- Removes the tutor's self-reported "hours per week" preference field
-- (AlterTable "tutor_profiles" drop column "hours_per_week").
ALTER TABLE "tutor_profiles" DROP COLUMN "hours_per_week";
