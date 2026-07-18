-- This is an empty migration.
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


ALTER TABLE "learn_requests"
ADD CONSTRAINT budget_range_valid CHECK (
budget_min IS NULL OR budget_max IS NULL OR budget_max >= budget_min
);

ALTER TABLE "learn_requests"
ADD CONSTRAINT required_fields_when_submitted CHECK (
status = 'DRAFT' OR (type IS NOT NULL AND category_id IS NOT NULL)
);