-- AlterTable
ALTER TABLE "work_order_ticket" ADD COLUMN     "notificationId" TEXT,
ADD COLUMN     "priority" "Priority" NOT NULL DEFAULT 'Unsorted',
ADD COLUMN     "priorityReasonWhy" TEXT;

-- CreateIndex
CREATE INDEX "work_order_ticket_notificationId_idx" ON "work_order_ticket"("notificationId");

-- AddForeignKey
ALTER TABLE "work_order_ticket" ADD CONSTRAINT "work_order_ticket_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
