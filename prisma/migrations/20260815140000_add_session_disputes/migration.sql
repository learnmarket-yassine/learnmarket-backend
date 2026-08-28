-- AlterEnum
ALTER TYPE "session_status" ADD VALUE 'DISPUTED' BEFORE 'COMPLETED';

-- CreateEnum
CREATE TYPE "dispute_outcome" AS ENUM ('REFUNDED', 'RELEASED');

-- CreateTable
CREATE TABLE "session_disputes" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "raised_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "dispute_outcome",
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,

    CONSTRAINT "session_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_disputes_session_id_key" ON "session_disputes"("session_id");

-- CreateIndex
CREATE INDEX "session_disputes_outcome_idx" ON "session_disputes"("outcome");

-- AddForeignKey
ALTER TABLE "session_disputes" ADD CONSTRAINT "session_disputes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing dispute data off Session before dropping the columns
INSERT INTO "session_disputes" ("id", "session_id", "reason", "raised_at")
SELECT gen_random_uuid()::text, "id", "dispute_reason", "disputed_at"
FROM "sessions"
WHERE "disputed_at" IS NOT NULL;

-- AlterTable
ALTER TABLE "sessions" DROP COLUMN "dispute_reason",
DROP COLUMN "disputed_at";
