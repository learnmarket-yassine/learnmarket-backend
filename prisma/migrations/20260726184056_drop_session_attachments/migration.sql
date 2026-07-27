/*
  Warnings:

  - You are about to drop the column `time_range` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `time_range` on the `slot_holds` table. All the data in the column will be lost.
  - You are about to drop the `session_attachments` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "session_attachments" DROP CONSTRAINT "session_attachments_session_id_fkey";

-- DropForeignKey
ALTER TABLE "session_attachments" DROP CONSTRAINT "session_attachments_uploader_id_fkey";

-- DropTable
DROP TABLE "session_attachments";
