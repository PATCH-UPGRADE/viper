-- AlterTable
ALTER TABLE "work_order_ticket" ADD COLUMN     "chatToolCallId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "work_order_ticket_chatToolCallId_key" ON "work_order_ticket"("chatToolCallId");
