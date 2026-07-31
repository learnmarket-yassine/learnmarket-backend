-- AlterEnum
ALTER TYPE "session_status" ADD VALUE 'PENDING_REVIEW';

-- AlterTable
-- Adds the parallel confirmation-gate fields to "sessions".
-- NOTE: the raw diff also proposed dropping "time_range" on "bookings" and
-- "slot_holds" -- those are GENERATED ALWAYS AS STORED columns backing the
-- GIST exclusion constraints from the scheduling_constraints migration, not
-- represented in schema.prisma by design. Deliberately excluded here (same
-- as the replace_zoom_with_daily migration immediately before this one).
ALTER TABLE "sessions" ADD COLUMN     "dispute_reason" TEXT,
ADD COLUMN     "disputed_at" TIMESTAMP(3),
ADD COLUMN     "learner_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "summary_submitted_at" TIMESTAMP(3);
