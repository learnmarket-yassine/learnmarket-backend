-- CreateEnum
CREATE TYPE "exception_type" AS ENUM ('BLOCKED', 'ADDED');

-- CreateEnum
CREATE TYPE "JobRequestType" AS ENUM ('ONE_TIME', 'COURSE');

-- CreateEnum
CREATE TYPE "proposal_status" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "proposal_session_status" AS ENUM ('LOCKED', 'PENDING_SCHEDULE', 'HELD', 'BOOKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "hold_status" AS ENUM ('ACTIVE', 'EXPIRED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "tutor_availability_rules" (
    "id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" INTEGER NOT NULL,
    "end_time" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_availability_exceptions" (
    "id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "exception_type" NOT NULL,
    "start_time" INTEGER,
    "end_time" INTEGER,
    "reason" TEXT,
    "timezone" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_requests" (
    "id" TEXT NOT NULL,
    "learner_id" TEXT NOT NULL,
    "type" "JobRequestType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposals" (
    "id" TEXT NOT NULL,
    "job_request_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "status" "proposal_status" NOT NULL DEFAULT 'PENDING',
    "total_sessions" INTEGER NOT NULL,
    "session_duration_minutes" INTEGER NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_sessions" (
    "id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "session_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "status" "proposal_session_status" NOT NULL DEFAULT 'LOCKED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposal_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_holds" (
    "id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "learner_id" TEXT NOT NULL,
    "proposal_session_id" TEXT NOT NULL,
    "start_time" TIMESTAMPTZ(3) NOT NULL,
    "end_time" TIMESTAMPTZ(3) NOT NULL,
    "status" "hold_status" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slot_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "learner_id" TEXT NOT NULL,
    "proposal_session_id" TEXT,
    "slot_hold_id" TEXT,
    "start_time" TIMESTAMPTZ(3) NOT NULL,
    "end_time" TIMESTAMPTZ(3) NOT NULL,
    "status" "booking_status" NOT NULL DEFAULT 'CONFIRMED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tutor_availability_rules_tutor_id_idx" ON "tutor_availability_rules"("tutor_id");

-- CreateIndex
CREATE INDEX "tutor_availability_rules_tutor_id_day_of_week_idx" ON "tutor_availability_rules"("tutor_id", "day_of_week");

-- CreateIndex
CREATE INDEX "tutor_availability_exceptions_tutor_id_date_idx" ON "tutor_availability_exceptions"("tutor_id", "date");

-- CreateIndex
CREATE INDEX "job_requests_learner_id_idx" ON "job_requests"("learner_id");

-- CreateIndex
CREATE INDEX "job_requests_type_idx" ON "job_requests"("type");

-- CreateIndex
CREATE INDEX "proposals_job_request_id_idx" ON "proposals"("job_request_id");

-- CreateIndex
CREATE INDEX "proposals_tutor_id_idx" ON "proposals"("tutor_id");

-- CreateIndex
CREATE INDEX "proposals_status_idx" ON "proposals"("status");

-- CreateIndex
CREATE INDEX "proposal_sessions_proposal_id_idx" ON "proposal_sessions"("proposal_id");

-- CreateIndex
CREATE INDEX "proposal_sessions_proposal_id_status_idx" ON "proposal_sessions"("proposal_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_sessions_proposal_id_session_number_key" ON "proposal_sessions"("proposal_id", "session_number");

-- CreateIndex
CREATE UNIQUE INDEX "slot_holds_proposal_session_id_key" ON "slot_holds"("proposal_session_id");

-- CreateIndex
CREATE INDEX "slot_holds_tutor_id_start_time_end_time_idx" ON "slot_holds"("tutor_id", "start_time", "end_time");

-- CreateIndex
CREATE INDEX "slot_holds_learner_id_idx" ON "slot_holds"("learner_id");

-- CreateIndex
CREATE INDEX "slot_holds_status_expires_at_idx" ON "slot_holds"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_proposal_session_id_key" ON "bookings"("proposal_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_slot_hold_id_key" ON "bookings"("slot_hold_id");

-- CreateIndex
CREATE INDEX "bookings_tutor_id_start_time_end_time_idx" ON "bookings"("tutor_id", "start_time", "end_time");

-- CreateIndex
CREATE INDEX "bookings_learner_id_idx" ON "bookings"("learner_id");

-- AddForeignKey
ALTER TABLE "tutor_availability_rules" ADD CONSTRAINT "tutor_availability_rules_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_availability_exceptions" ADD CONSTRAINT "tutor_availability_exceptions_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_requests" ADD CONSTRAINT "job_requests_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_job_request_id_fkey" FOREIGN KEY ("job_request_id") REFERENCES "job_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_sessions" ADD CONSTRAINT "proposal_sessions_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_holds" ADD CONSTRAINT "slot_holds_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_holds" ADD CONSTRAINT "slot_holds_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_holds" ADD CONSTRAINT "slot_holds_proposal_session_id_fkey" FOREIGN KEY ("proposal_session_id") REFERENCES "proposal_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_proposal_session_id_fkey" FOREIGN KEY ("proposal_session_id") REFERENCES "proposal_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_slot_hold_id_fkey" FOREIGN KEY ("slot_hold_id") REFERENCES "slot_holds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
