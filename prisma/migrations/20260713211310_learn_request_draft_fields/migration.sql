-- DropForeignKey
ALTER TABLE "learn_requests" DROP CONSTRAINT "learn_requests_category_id_fkey";

-- AlterTable
ALTER TABLE "learn_requests" ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'DRAFT',
ALTER COLUMN "type" DROP NOT NULL,
ALTER COLUMN "category_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "learn_requests" ADD CONSTRAINT "learn_requests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
