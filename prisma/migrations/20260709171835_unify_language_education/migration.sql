/*
  Warnings:

  - You are about to drop the column `profile_id` on the `education` table. All the data in the column will be lost.
  - You are about to drop the `learner_education` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `learner_profile_languages` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `profile_languages` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `user_id` to the `education` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "education" DROP CONSTRAINT "education_profile_id_fkey";

-- DropForeignKey
ALTER TABLE "learner_education" DROP CONSTRAINT "learner_education_profile_id_fkey";

-- DropForeignKey
ALTER TABLE "learner_profile_languages" DROP CONSTRAINT "learner_profile_languages_profile_id_fkey";

-- DropForeignKey
ALTER TABLE "profile_languages" DROP CONSTRAINT "profile_languages_profile_id_fkey";

-- DropIndex
DROP INDEX "education_profile_id_idx";

-- AlterTable
ALTER TABLE "education" DROP COLUMN "profile_id",
ADD COLUMN     "user_id" TEXT NOT NULL;

-- DropTable
DROP TABLE "learner_education";

-- DropTable
DROP TABLE "learner_profile_languages";

-- DropTable
DROP TABLE "profile_languages";

-- CreateTable
CREATE TABLE "user_languages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "level" "LanguageLevel" NOT NULL,

    CONSTRAINT "user_languages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_languages_user_id_idx" ON "user_languages"("user_id");

-- CreateIndex
CREATE INDEX "education_user_id_idx" ON "education"("user_id");

-- AddForeignKey
ALTER TABLE "user_languages" ADD CONSTRAINT "user_languages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "education" ADD CONSTRAINT "education_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
