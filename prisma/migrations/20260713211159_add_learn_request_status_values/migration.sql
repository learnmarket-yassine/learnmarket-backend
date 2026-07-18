-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "learn_request_status" ADD VALUE 'DRAFT';
ALTER TYPE "learn_request_status" ADD VALUE 'PENDING_REVIEW';
ALTER TYPE "learn_request_status" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "learn_requests" ADD COLUMN     "preferred_languages" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "slot_holds" ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "learn_requests_status_idx" ON "learn_requests"("status");
