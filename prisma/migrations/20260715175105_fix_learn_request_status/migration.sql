/*
  Warnings:

  - The values [FILLED] on the enum `learn_request_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "learn_request_status_new" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED', 'COMPLETED', 'REMOVED');
ALTER TABLE "public"."learn_requests" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "learn_requests" ALTER COLUMN "status" TYPE "learn_request_status_new" USING ("status"::text::"learn_request_status_new");
ALTER TYPE "learn_request_status" RENAME TO "learn_request_status_old";
ALTER TYPE "learn_request_status_new" RENAME TO "learn_request_status";
DROP TYPE "public"."learn_request_status_old";
ALTER TABLE "learn_requests" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;
