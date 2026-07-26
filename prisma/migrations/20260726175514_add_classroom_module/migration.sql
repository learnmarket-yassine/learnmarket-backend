/*
  Warnings:

  - You are about to drop the column `time_range` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `time_range` on the `slot_holds` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "submission_status" AS ENUM ('ASSIGNED', 'SUBMITTED', 'EXCUSED');

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_comments" (
    "id" TEXT NOT NULL,
    "announcement_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_attachments" (
    "id" TEXT NOT NULL,
    "announcement_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT,
    "file_size" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "due_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_attachments" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT,
    "file_size" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_submissions" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "status" "submission_status" NOT NULL DEFAULT 'ASSIGNED',
    "submitted_at" TIMESTAMP(3),

    CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_attachments" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT,
    "file_size" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_comments" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcements_session_id_idx" ON "announcements"("session_id");

-- CreateIndex
CREATE INDEX "announcement_comments_announcement_id_idx" ON "announcement_comments"("announcement_id");

-- CreateIndex
CREATE INDEX "announcement_attachments_announcement_id_idx" ON "announcement_attachments"("announcement_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_session_id_key" ON "assignments"("session_id");

-- CreateIndex
CREATE INDEX "assignment_attachments_assignment_id_idx" ON "assignment_attachments"("assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_submissions_assignment_id_key" ON "assignment_submissions"("assignment_id");

-- CreateIndex
CREATE INDEX "submission_attachments_submission_id_idx" ON "submission_attachments"("submission_id");

-- CreateIndex
CREATE INDEX "assignment_comments_assignment_id_idx" ON "assignment_comments"("assignment_id");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_comments" ADD CONSTRAINT "announcement_comments_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_comments" ADD CONSTRAINT "announcement_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_attachments" ADD CONSTRAINT "announcement_attachments_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_attachments" ADD CONSTRAINT "assignment_attachments_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "assignment_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_comments" ADD CONSTRAINT "assignment_comments_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_comments" ADD CONSTRAINT "assignment_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
