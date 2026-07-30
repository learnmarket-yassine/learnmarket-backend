-- CreateEnum
CREATE TYPE "sparks_transaction_type" AS ENUM ('MONTHLY_GRANT', 'PURCHASE', 'PROPOSAL_SPEND', 'REFUND');

-- AlterTable
ALTER TABLE "tutor_profiles" ADD COLUMN     "sparks_balance" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "sparks_offers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sparks_amount" INTEGER NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sparks_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sparks_transactions" (
    "id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "type" "sparks_transaction_type" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "proposal_id" TEXT,
    "offer_id" TEXT,
    "stripe_payment_intent_id" TEXT,
    "price_paid_cents" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sparks_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sparks_transactions_stripe_payment_intent_id_key" ON "sparks_transactions"("stripe_payment_intent_id");

-- CreateIndex
CREATE INDEX "sparks_transactions_tutor_id_idx" ON "sparks_transactions"("tutor_id");

-- CreateIndex
CREATE INDEX "sparks_transactions_tutor_id_created_at_idx" ON "sparks_transactions"("tutor_id", "created_at");

-- AddForeignKey
ALTER TABLE "sparks_transactions" ADD CONSTRAINT "sparks_transactions_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sparks_transactions" ADD CONSTRAINT "sparks_transactions_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sparks_transactions" ADD CONSTRAINT "sparks_transactions_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "sparks_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
