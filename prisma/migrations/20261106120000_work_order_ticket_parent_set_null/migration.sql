-- DropForeignKey
ALTER TABLE "work_order_ticket" DROP CONSTRAINT "work_order_ticket_parentId_fkey";

-- AddForeignKey
ALTER TABLE "work_order_ticket" ADD CONSTRAINT "work_order_ticket_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "work_order_ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
