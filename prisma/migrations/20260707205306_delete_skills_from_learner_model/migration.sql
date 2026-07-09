/*
  Warnings:

  - You are about to drop the `learner_skills` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "learner_skills" DROP CONSTRAINT "learner_skills_skill_id_fkey";

-- DropForeignKey
ALTER TABLE "learner_skills" DROP CONSTRAINT "learner_skills_user_id_fkey";

-- DropTable
DROP TABLE "learner_skills";
