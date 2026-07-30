-- AlterTable
ALTER TABLE "learn_requests" ADD COLUMN     "completed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "feedbacks" (
    "id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "about_user_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedbacks_about_user_id_idx" ON "feedbacks"("about_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "feedbacks_proposal_id_author_id_key" ON "feedbacks"("proposal_id", "author_id");

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_about_user_id_fkey" FOREIGN KEY ("about_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraint
ALTER TABLE "feedbacks" ADD CONSTRAINT rating_range CHECK (rating BETWEEN 1 AND 5);
