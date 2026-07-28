-- CreateTable
CREATE TABLE "shortlisted_proposals" (
    "id" TEXT NOT NULL,
    "learner_id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shortlisted_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shortlisted_proposals_learner_id_idx" ON "shortlisted_proposals"("learner_id");

-- CreateIndex
CREATE INDEX "shortlisted_proposals_proposal_id_idx" ON "shortlisted_proposals"("proposal_id");

-- CreateIndex
CREATE UNIQUE INDEX "shortlisted_proposals_learner_id_proposal_id_key" ON "shortlisted_proposals"("learner_id", "proposal_id");

-- AddForeignKey
ALTER TABLE "shortlisted_proposals" ADD CONSTRAINT "shortlisted_proposals_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlisted_proposals" ADD CONSTRAINT "shortlisted_proposals_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
