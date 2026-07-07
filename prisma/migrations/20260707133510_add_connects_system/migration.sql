-- CreateEnum
CREATE TYPE "ConnectsTransactionType" AS ENUM ('PURCHASE', 'SPEND', 'REFUND', 'BONUS', 'SIGNUP_GRANT');

-- CreateEnum
CREATE TYPE "AnnonceStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "tutor_profiles" ADD COLUMN     "connects" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "annonces" (
    "id" TEXT NOT NULL,
    "learner_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "AnnonceStatus" NOT NULL DEFAULT 'OPEN',
    "proposal_cost" INTEGER NOT NULL DEFAULT 2,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "annonces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposals" (
    "id" TEXT NOT NULL,
    "annonce_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "message" TEXT,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connects_packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "stripe_price_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connects_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connects_transactions" (
    "id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "type" "ConnectsTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "related_proposal_id" TEXT,
    "related_package_id" TEXT,
    "stripe_payment_intent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connects_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "annonces_learner_id_idx" ON "annonces"("learner_id");

-- CreateIndex
CREATE INDEX "proposals_annonce_id_idx" ON "proposals"("annonce_id");

-- CreateIndex
CREATE INDEX "proposals_tutor_id_idx" ON "proposals"("tutor_id");

-- CreateIndex
CREATE UNIQUE INDEX "proposals_annonce_id_tutor_id_key" ON "proposals"("annonce_id", "tutor_id");

-- CreateIndex
CREATE UNIQUE INDEX "connects_transactions_stripe_payment_intent_id_key" ON "connects_transactions"("stripe_payment_intent_id");

-- CreateIndex
CREATE INDEX "connects_transactions_tutor_id_idx" ON "connects_transactions"("tutor_id");

-- CreateIndex
CREATE INDEX "connects_transactions_related_proposal_id_idx" ON "connects_transactions"("related_proposal_id");

-- AddForeignKey
ALTER TABLE "annonces" ADD CONSTRAINT "annonces_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_annonce_id_fkey" FOREIGN KEY ("annonce_id") REFERENCES "annonces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "tutor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connects_transactions" ADD CONSTRAINT "connects_transactions_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "tutor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connects_transactions" ADD CONSTRAINT "connects_transactions_related_proposal_id_fkey" FOREIGN KEY ("related_proposal_id") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connects_transactions" ADD CONSTRAINT "connects_transactions_related_package_id_fkey" FOREIGN KEY ("related_package_id") REFERENCES "connects_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
