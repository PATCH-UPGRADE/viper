-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TicketActivityType" ADD VALUE 'TICKET_LINKED';
ALTER TYPE "TicketActivityType" ADD VALUE 'TICKET_UNLINKED';

-- CreateTable
CREATE TABLE "work_order_ticket_link" (
    "id" TEXT NOT NULL,
    "ticketAId" TEXT NOT NULL,
    "ticketBId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_ticket_link_pkey" PRIMARY KEY ("id"),
    -- Canonical order makes the unique index below direction-agnostic.
    CONSTRAINT "work_order_ticket_link_canonical_order" CHECK ("ticketAId" < "ticketBId")
);

-- CreateIndex
CREATE INDEX "work_order_ticket_link_ticketBId_idx" ON "work_order_ticket_link"("ticketBId");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_ticket_link_ticketAId_ticketBId_key" ON "work_order_ticket_link"("ticketAId", "ticketBId");

-- AddForeignKey
ALTER TABLE "work_order_ticket_link" ADD CONSTRAINT "work_order_ticket_link_ticketAId_fkey" FOREIGN KEY ("ticketAId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_ticket_link" ADD CONSTRAINT "work_order_ticket_link_ticketBId_fkey" FOREIGN KEY ("ticketBId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
