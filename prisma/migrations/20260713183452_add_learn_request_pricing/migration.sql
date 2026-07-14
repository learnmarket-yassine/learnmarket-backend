/*
  Warnings:

  - Added the required column `total_price` to the `proposals` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "learn_requests" ADD COLUMN     "budget_max" DECIMAL(10,2),
ADD COLUMN     "budget_min" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "proposals" ADD COLUMN     "total_price" DECIMAL(10,2) NOT NULL;
