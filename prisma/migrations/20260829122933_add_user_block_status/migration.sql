-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'ACCOUNT_STATUS_UPDATED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "is_blocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "users_is_blocked_idx" ON "users"("is_blocked");
