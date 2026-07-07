-- DropForeignKey
ALTER TABLE "profile_skills" DROP CONSTRAINT "profile_skills_profile_id_fkey";

-- AlterTable
ALTER TABLE "tutor_profiles" DROP COLUMN "skills";

-- DropTable
DROP TABLE "profile_skills";

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_profile_skills" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_profile_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learner_skills" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learner_skills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

-- CreateIndex
CREATE INDEX "skills_name_idx" ON "skills"("name");

-- CreateIndex
CREATE INDEX "tutor_profile_skills_profile_id_idx" ON "tutor_profile_skills"("profile_id");

-- CreateIndex
CREATE INDEX "tutor_profile_skills_skill_id_idx" ON "tutor_profile_skills"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_profile_skills_profile_id_skill_id_key" ON "tutor_profile_skills"("profile_id", "skill_id");

-- CreateIndex
CREATE INDEX "learner_skills_user_id_idx" ON "learner_skills"("user_id");

-- CreateIndex
CREATE INDEX "learner_skills_skill_id_idx" ON "learner_skills"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "learner_skills_user_id_skill_id_key" ON "learner_skills"("user_id", "skill_id");

-- AddForeignKey
ALTER TABLE "tutor_profile_skills" ADD CONSTRAINT "tutor_profile_skills_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "tutor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_profile_skills" ADD CONSTRAINT "tutor_profile_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_skills" ADD CONSTRAINT "learner_skills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_skills" ADD CONSTRAINT "learner_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

