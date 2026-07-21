/*
  Warnings:

  - You are about to drop the column `proposal_session_id` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `time_range` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `proposal_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `total_sessions` on the `proposals` table. All the data in the column will be lost.
  - You are about to drop the column `proposal_session_id` on the `slot_holds` table. All the data in the column will be lost.
  - You are about to drop the column `time_range` on the `slot_holds` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[session_id]` on the table `bookings` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[session_id]` on the table `slot_holds` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `session_id` to the `slot_holds` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "payout_method" AS ENUM ('PER_SESSION', 'ON_COMPLETION');

-- CreateEnum
CREATE TYPE "session_status" AS ENUM ('LOCKED', 'PENDING_SCHEDULE', 'HELD', 'BOOKED', 'COMPLETED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_proposal_session_id_fkey";

-- DropForeignKey
ALTER TABLE "slot_holds" DROP CONSTRAINT "slot_holds_proposal_session_id_fkey";

-- DropIndex
DROP INDEX "bookings_proposal_session_id_key";

-- DropIndex
DROP INDEX "proposal_sessions_proposal_id_status_idx";

-- DropIndex
DROP INDEX "proposals_learn_request_id_idx";

-- DropIndex
DROP INDEX "slot_holds_proposal_session_id_key";

-- AlterTable
ALTER TABLE "bookings" DROP COLUMN "proposal_session_id",
ADD COLUMN     "session_id" TEXT;

-- AlterTable
ALTER TABLE "proposal_sessions" DROP COLUMN "status";

-- AlterTable
ALTER TABLE "proposals" DROP COLUMN "total_sessions",
ADD COLUMN     "payout_method" "payout_method" NOT NULL DEFAULT 'ON_COMPLETION',
ADD COLUMN     "viewed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "slot_holds" DROP COLUMN "proposal_session_id",
ADD COLUMN     "session_id" TEXT NOT NULL;

-- DropEnum
DROP TYPE "proposal_session_status";

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "session_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "status" "session_status" NOT NULL DEFAULT 'LOCKED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_proposal_id_idx" ON "sessions"("proposal_id");

-- CreateIndex
CREATE INDEX "sessions_proposal_id_status_idx" ON "sessions"("proposal_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_proposal_id_session_number_key" ON "sessions"("proposal_id", "session_number");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_session_id_key" ON "bookings"("session_id");

-- CreateIndex
CREATE INDEX "proposals_learn_request_id_status_idx" ON "proposals"("learn_request_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "slot_holds_session_id_key" ON "slot_holds"("session_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_holds" ADD CONSTRAINT "slot_holds_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
