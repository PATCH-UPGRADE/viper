/*
  Warnings:

  - You are about to drop the `ticket_seen` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ticket_seen" DROP CONSTRAINT "ticket_seen_ticketId_fkey";

-- DropForeignKey
ALTER TABLE "ticket_seen" DROP CONSTRAINT "ticket_seen_userId_fkey";

-- DropTable
DROP TABLE "ticket_seen";

-- CreateTable
CREATE TABLE "ticket_watch" (
    "userId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_watch_pkey" PRIMARY KEY ("userId","ticketId")
);

-- CreateIndex
CREATE INDEX "ticket_watch_userId_idx" ON "ticket_watch"("userId");

-- CreateIndex
CREATE INDEX "ticket_watch_ticketId_idx" ON "ticket_watch"("ticketId");

-- AddForeignKey
ALTER TABLE "ticket_watch" ADD CONSTRAINT "ticket_watch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_watch" ADD CONSTRAINT "ticket_watch_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "work_order_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
