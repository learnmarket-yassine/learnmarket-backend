/*
  Warnings:

  - You are about to drop the column `time_range` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `job_request_id` on the `proposals` table. All the data in the column will be lost.
  - You are about to drop the column `time_range` on the `slot_holds` table. All the data in the column will be lost.
  - You are about to drop the `job_requests` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `learn_request_id` to the `proposals` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "learn_request_status" AS ENUM ('OPEN', 'FILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LearnRequestType" AS ENUM ('ONE_TIME', 'COURSE');

-- CreateEnum
CREATE TYPE "proficiency_level" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- DropForeignKey
ALTER TABLE "job_requests" DROP CONSTRAINT "job_requests_learner_id_fkey";

-- DropForeignKey
ALTER TABLE "proposals" DROP CONSTRAINT "proposals_job_request_id_fkey";

-- DropIndex
DROP INDEX "proposals_job_request_id_idx";

-- AlterTable
ALTER TABLE "proposals" DROP COLUMN "job_request_id",
ADD COLUMN     "learn_request_id" TEXT NOT NULL;


-- DropTable
DROP TABLE "job_requests";

-- DropEnum
DROP TYPE "JobRequestType";

-- CreateTable
CREATE TABLE "learn_requests" (
    "id" TEXT NOT NULL,
    "learner_id" TEXT NOT NULL,
    "status" "learn_request_status" NOT NULL DEFAULT 'OPEN',
    "type" "LearnRequestType" NOT NULL,
    "level" "proficiency_level",
    "title" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "description" TEXT,
    "requested_frequency" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learn_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learn_request_skills" (
    "id" TEXT NOT NULL,
    "learn_request_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learn_request_skills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "learn_requests_learner_id_idx" ON "learn_requests"("learner_id");

-- CreateIndex
CREATE INDEX "learn_requests_type_idx" ON "learn_requests"("type");

-- CreateIndex
CREATE INDEX "learn_request_skills_learn_request_id_idx" ON "learn_request_skills"("learn_request_id");

-- CreateIndex
CREATE INDEX "learn_request_skills_skill_id_idx" ON "learn_request_skills"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "learn_request_skills_learn_request_id_skill_id_key" ON "learn_request_skills"("learn_request_id", "skill_id");

-- CreateIndex
CREATE INDEX "proposals_learn_request_id_idx" ON "proposals"("learn_request_id");

-- AddForeignKey
ALTER TABLE "learn_requests" ADD CONSTRAINT "learn_requests_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learn_requests" ADD CONSTRAINT "learn_requests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learn_request_skills" ADD CONSTRAINT "learn_request_skills_learn_request_id_fkey" FOREIGN KEY ("learn_request_id") REFERENCES "learn_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learn_request_skills" ADD CONSTRAINT "learn_request_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_learn_request_id_fkey" FOREIGN KEY ("learn_request_id") REFERENCES "learn_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
