-- CreateEnum
CREATE TYPE "RescheduleStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TicketActivityType" ADD VALUE 'RESCHEDULE_REQUESTED';
ALTER TYPE "TicketActivityType" ADD VALUE 'RESCHEDULE_APPROVED';
ALTER TYPE "TicketActivityType" ADD VALUE 'RESCHEDULE_DECLINED';

-- CreateTable
CREATE TABLE "reschedule_request" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "fromScheduledAt" TIMESTAMP(3),
    "proposedAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "RescheduleStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reschedule_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reschedule_request_ticketId_status_idx" ON "reschedule_request"("ticketId", "status");

-- AddForeignKey
ALTER TABLE "reschedule_request" ADD CONSTRAINT "reschedule_request_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reschedule_request" ADD CONSTRAINT "reschedule_request_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reschedule_request" ADD CONSTRAINT "reschedule_request_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
