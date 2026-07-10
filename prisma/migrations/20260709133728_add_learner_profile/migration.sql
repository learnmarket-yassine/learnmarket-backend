-- CreateTable
CREATE TABLE "learner_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "availability" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learner_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learner_profile_languages" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "level" "LanguageLevel" NOT NULL,

    CONSTRAINT "learner_profile_languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learner_education" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "degree" TEXT,
    "field_of_study" TEXT,
    "start_year" INTEGER,
    "end_year" INTEGER,

    CONSTRAINT "learner_education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learner_profile_interests" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "specialty_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learner_profile_interests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "learner_profiles_user_id_key" ON "learner_profiles"("user_id");

-- CreateIndex
CREATE INDEX "learner_profile_languages_profile_id_idx" ON "learner_profile_languages"("profile_id");

-- CreateIndex
CREATE INDEX "learner_education_profile_id_idx" ON "learner_education"("profile_id");

-- CreateIndex
CREATE INDEX "learner_profile_interests_profile_id_idx" ON "learner_profile_interests"("profile_id");

-- CreateIndex
CREATE INDEX "learner_profile_interests_specialty_id_idx" ON "learner_profile_interests"("specialty_id");

-- CreateIndex
CREATE UNIQUE INDEX "learner_profile_interests_profile_id_specialty_id_key" ON "learner_profile_interests"("profile_id", "specialty_id");

-- AddForeignKey
ALTER TABLE "learner_profiles" ADD CONSTRAINT "learner_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_profile_languages" ADD CONSTRAINT "learner_profile_languages_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "learner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_education" ADD CONSTRAINT "learner_education_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "learner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_profile_interests" ADD CONSTRAINT "learner_profile_interests_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "learner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_profile_interests" ADD CONSTRAINT "learner_profile_interests_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
