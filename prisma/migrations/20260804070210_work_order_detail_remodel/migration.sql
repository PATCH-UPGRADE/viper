-- AlterEnum
ALTER TYPE "TicketActivityType" ADD VALUE 'WORK_ORDER_CREATED';

-- CreateIndex
CREATE INDEX "work_order_ticket_priority_idx" ON "work_order_ticket"("priority");
