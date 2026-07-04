-- AlterTable
ALTER TABLE "tutor_profiles" ADD COLUMN     "skills" TEXT[] DEFAULT ARRAY[]::TEXT[];
