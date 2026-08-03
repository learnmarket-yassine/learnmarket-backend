-- AlterTable
-- Replaces the Zoom integration fields with Daily.co room fields.
-- NOTE: the raw diff also proposed dropping "time_range" on "bookings" and
-- "slot_holds" -- those are GENERATED ALWAYS AS STORED columns backing the
-- GIST exclusion constraints from the scheduling_constraints migration, not
-- represented in schema.prisma by design. Deliberately excluded here.
ALTER TABLE "sessions" DROP COLUMN "zoom_join_url",
DROP COLUMN "zoom_meeting_id",
DROP COLUMN "zoom_password",
DROP COLUMN "zoom_start_url",
ADD COLUMN     "daily_room_name" TEXT,
ADD COLUMN     "daily_room_url" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sessions_daily_room_name_key" ON "sessions"("daily_room_name");
