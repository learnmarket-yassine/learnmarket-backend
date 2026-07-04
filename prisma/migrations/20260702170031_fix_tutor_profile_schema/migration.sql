/*
  Warnings:

  - You are about to drop the column `bio` on the `tutor_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `connects` on the `tutor_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `headline` on the `tutor_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "employment" ADD COLUMN     "current" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tutor_profiles" DROP COLUMN "bio",
DROP COLUMN "connects",
DROP COLUMN "headline";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "location",
DROP COLUMN "phone",
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "headline" TEXT;
