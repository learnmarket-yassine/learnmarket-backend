/*
  Warnings:

  - You are about to drop the column `image_url` on the `portfolio_items` table. All the data in the column will be lost.
  - You are about to drop the column `avatar` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "portfolio_items" DROP COLUMN "image_url";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "avatar",
ADD COLUMN     "avatar_key" TEXT;

-- CreateTable
CREATE TABLE "portfolio_images" (
    "id" TEXT NOT NULL,
    "portfolio_item_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certification_files" (
    "id" TEXT NOT NULL,
    "certification_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "file_name" TEXT,
    "mime_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certification_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_certificates" (
    "id" TEXT NOT NULL,
    "employment_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "file_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employment_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolio_images_portfolio_item_id_idx" ON "portfolio_images"("portfolio_item_id");

-- CreateIndex
CREATE INDEX "certification_files_certification_id_idx" ON "certification_files"("certification_id");

-- CreateIndex
CREATE INDEX "employment_certificates_employment_id_idx" ON "employment_certificates"("employment_id");

-- AddForeignKey
ALTER TABLE "portfolio_images" ADD CONSTRAINT "portfolio_images_portfolio_item_id_fkey" FOREIGN KEY ("portfolio_item_id") REFERENCES "portfolio_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_files" ADD CONSTRAINT "certification_files_certification_id_fkey" FOREIGN KEY ("certification_id") REFERENCES "certifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_certificates" ADD CONSTRAINT "employment_certificates_employment_id_fkey" FOREIGN KEY ("employment_id") REFERENCES "employment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
