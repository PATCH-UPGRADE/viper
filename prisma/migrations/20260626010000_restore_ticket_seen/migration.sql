-- Re-add per-user ticket "seen" tracking to drive the unread-comments indicator.
CREATE TABLE "ticket_seen" (
    "userId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_seen_pkey" PRIMARY KEY ("userId","ticketId")
);

-- CreateIndex
CREATE INDEX "ticket_seen_userId_idx" ON "ticket_seen"("userId");

-- CreateIndex
CREATE INDEX "ticket_seen_ticketId_idx" ON "ticket_seen"("ticketId");

-- AddForeignKey
ALTER TABLE "ticket_seen" ADD CONSTRAINT "ticket_seen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_seen" ADD CONSTRAINT "ticket_seen_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
