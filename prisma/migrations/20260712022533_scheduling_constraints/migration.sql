-- Hand-written constraints not expressible in schema.prisma:
-- exclusion constraints, multi-column CHECK constraints, and the btree_gist extension.
-- This migration was generated with `--create-only` and filled in by hand.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "tutor_availability_rules"
ADD CONSTRAINT rule_time_order CHECK ("end_time" > "start_time");

ALTER TABLE "tutor_availability_exceptions"
ADD CONSTRAINT exception_time_range_consistency CHECK (
  ("start_time" IS NULL AND "end_time" IS NULL)
  OR ("start_time" IS NOT NULL AND "end_time" IS NOT NULL AND "end_time" > "start_time")
);

ALTER TABLE "slot_holds"
ADD COLUMN time_range tstzrange
  GENERATED ALWAYS AS (tstzrange("start_time", "end_time")) STORED;
ALTER TABLE "slot_holds"
ADD CONSTRAINT no_overlapping_active_holds
EXCLUDE USING gist ("tutor_id" WITH =, time_range WITH &&) WHERE (status = 'ACTIVE');

ALTER TABLE "bookings"
ADD COLUMN time_range tstzrange
  GENERATED ALWAYS AS (tstzrange("start_time", "end_time")) STORED;
ALTER TABLE "bookings"
ADD CONSTRAINT no_overlapping_confirmed_bookings
EXCLUDE USING gist ("tutor_id" WITH =, time_range WITH &&) WHERE (status = 'CONFIRMED');

ALTER TABLE "proposals"
ADD CONSTRAINT total_sessions_positive CHECK ("total_sessions" > 0);
ALTER TABLE "proposals"
ADD CONSTRAINT session_duration_positive CHECK ("session_duration_minutes" > 0);
ALTER TABLE "proposal_sessions"
ADD CONSTRAINT session_number_positive CHECK ("session_number" > 0);
