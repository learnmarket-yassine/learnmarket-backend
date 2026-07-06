/*
  Warnings:

  - You are about to drop the column `project_url` on the `portfolio_items` table. All the data in the column will be lost.
  - You are about to drop the `portfolio_images` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "PortfolioMediaType" AS ENUM ('IMAGE', 'VIDEO_FILE', 'VIDEO_LINK', 'LINK');

-- DropForeignKey
ALTER TABLE "portfolio_images" DROP CONSTRAINT "portfolio_images_portfolio_item_id_fkey";

-- AlterTable
ALTER TABLE "portfolio_items" DROP COLUMN "project_url",
ADD COLUMN     "role" TEXT,
ADD COLUMN     "skills" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- DropTable
DROP TABLE "portfolio_images";

-- CreateTable
CREATE TABLE "portfolio_media" (
    "id" TEXT NOT NULL,
    "portfolio_item_id" TEXT NOT NULL,
    "type" "PortfolioMediaType" NOT NULL,
    "key" TEXT,
    "url" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolio_media_portfolio_item_id_idx" ON "portfolio_media"("portfolio_item_id");

-- AddForeignKey
ALTER TABLE "portfolio_media" ADD CONSTRAINT "portfolio_media_portfolio_item_id_fkey" FOREIGN KEY ("portfolio_item_id") REFERENCES "portfolio_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
