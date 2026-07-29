-- CreateEnum
CREATE TYPE "tutor_verification_status" AS ENUM ('UNSUBMITTED', 'PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

-- AlterTable
ALTER TABLE "tutor_profiles" DROP COLUMN "is_verified",
ADD COLUMN     "review_note" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by_id" TEXT,
ADD COLUMN     "submitted_at" TIMESTAMP(3),
ADD COLUMN     "verification_status" "tutor_verification_status" NOT NULL DEFAULT 'UNSUBMITTED';

-- CreateIndex
CREATE INDEX "tutor_profiles_verification_status_idx" ON "tutor_profiles"("verification_status");

-- AddForeignKey
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
