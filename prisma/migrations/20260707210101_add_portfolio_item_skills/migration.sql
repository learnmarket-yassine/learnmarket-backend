-- AlterTable
ALTER TABLE "portfolio_items" DROP COLUMN "skills";

-- CreateTable
CREATE TABLE "portfolio_item_skills" (
    "id" TEXT NOT NULL,
    "portfolio_item_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_item_skills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolio_item_skills_portfolio_item_id_idx" ON "portfolio_item_skills"("portfolio_item_id");

-- CreateIndex
CREATE INDEX "portfolio_item_skills_skill_id_idx" ON "portfolio_item_skills"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_item_skills_portfolio_item_id_skill_id_key" ON "portfolio_item_skills"("portfolio_item_id", "skill_id");

-- AddForeignKey
ALTER TABLE "portfolio_item_skills" ADD CONSTRAINT "portfolio_item_skills_portfolio_item_id_fkey" FOREIGN KEY ("portfolio_item_id") REFERENCES "portfolio_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_item_skills" ADD CONSTRAINT "portfolio_item_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

