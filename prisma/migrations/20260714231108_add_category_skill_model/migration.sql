/*
  Warnings:

  - The values [PENDING_REVIEW,REJECTED] on the enum `learn_request_status` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `rejection_reason` on the `learn_requests` table. All the data in the column will be lost.
  - You are about to drop the column `reviewed_at` on the `learn_requests` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "learn_request_status_new" AS ENUM ('DRAFT', 'OPEN', 'FILLED', 'CANCELLED');
ALTER TABLE "public"."learn_requests" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "learn_requests" ALTER COLUMN "status" TYPE "learn_request_status_new" USING ("status"::text::"learn_request_status_new");
ALTER TYPE "learn_request_status" RENAME TO "learn_request_status_old";
ALTER TYPE "learn_request_status_new" RENAME TO "learn_request_status";
DROP TYPE "public"."learn_request_status_old";
ALTER TABLE "learn_requests" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- AlterTable
ALTER TABLE "learn_requests" DROP COLUMN "rejection_reason",
DROP COLUMN "reviewed_at";

-- CreateTable
CREATE TABLE "category_skills" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_skills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "category_skills_category_id_idx" ON "category_skills"("category_id");

-- CreateIndex
CREATE INDEX "category_skills_skill_id_idx" ON "category_skills"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "category_skills_category_id_skill_id_key" ON "category_skills"("category_id", "skill_id");

-- AddForeignKey
ALTER TABLE "category_skills" ADD CONSTRAINT "category_skills_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_skills" ADD CONSTRAINT "category_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
