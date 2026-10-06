-- CreateTable
CREATE TABLE "reschedule_request" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "suggestedAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reschedule_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reschedule_request_ticketId_requesterId_idx" ON "reschedule_request"("ticketId", "requesterId");

-- AddForeignKey
ALTER TABLE "reschedule_request" ADD CONSTRAINT "reschedule_request_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reschedule_request" ADD CONSTRAINT "reschedule_request_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

