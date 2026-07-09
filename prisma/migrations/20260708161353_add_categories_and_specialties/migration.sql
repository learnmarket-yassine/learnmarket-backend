-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialties" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_profile_specialties" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "specialty_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_profile_specialties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_is_active_idx" ON "categories"("is_active");

-- CreateIndex
CREATE INDEX "specialties_category_id_idx" ON "specialties"("category_id");

-- CreateIndex
CREATE INDEX "specialties_is_active_idx" ON "specialties"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "specialties_category_id_slug_key" ON "specialties"("category_id", "slug");

-- CreateIndex
CREATE INDEX "tutor_profile_specialties_profile_id_idx" ON "tutor_profile_specialties"("profile_id");

-- CreateIndex
CREATE INDEX "tutor_profile_specialties_specialty_id_idx" ON "tutor_profile_specialties"("specialty_id");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_profile_specialties_profile_id_specialty_id_key" ON "tutor_profile_specialties"("profile_id", "specialty_id");

-- AddForeignKey
ALTER TABLE "specialties" ADD CONSTRAINT "specialties_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_profile_specialties" ADD CONSTRAINT "tutor_profile_specialties_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "tutor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_profile_specialties" ADD CONSTRAINT "tutor_profile_specialties_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
