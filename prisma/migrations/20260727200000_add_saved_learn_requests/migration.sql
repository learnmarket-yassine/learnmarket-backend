-- CreateTable
CREATE TABLE "saved_learn_requests" (
    "id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "learn_request_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_learn_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_learn_requests_tutor_id_idx" ON "saved_learn_requests"("tutor_id");

-- CreateIndex
CREATE INDEX "saved_learn_requests_learn_request_id_idx" ON "saved_learn_requests"("learn_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_learn_requests_tutor_id_learn_request_id_key" ON "saved_learn_requests"("tutor_id", "learn_request_id");

-- AddForeignKey
ALTER TABLE "saved_learn_requests" ADD CONSTRAINT "saved_learn_requests_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_learn_requests" ADD CONSTRAINT "saved_learn_requests_learn_request_id_fkey" FOREIGN KEY ("learn_request_id") REFERENCES "learn_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
