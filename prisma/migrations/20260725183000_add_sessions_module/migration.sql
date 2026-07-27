-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "zoom_meeting_id" TEXT,
ADD COLUMN     "zoom_join_url" TEXT,
ADD COLUMN     "zoom_start_url" TEXT,
ADD COLUMN     "zoom_password" TEXT,
ADD COLUMN     "tutor_joined_at" TIMESTAMP(3),
ADD COLUMN     "learner_joined_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "session_attachments" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT,
    "file_size" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_attachments_session_id_idx" ON "session_attachments"("session_id");

-- AddForeignKey
ALTER TABLE "session_attachments" ADD CONSTRAINT "session_attachments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_attachments" ADD CONSTRAINT "session_attachments_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
