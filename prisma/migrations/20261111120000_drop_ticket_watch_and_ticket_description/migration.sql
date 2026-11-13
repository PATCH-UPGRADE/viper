-- DropForeignKey
ALTER TABLE "ticket_description" DROP CONSTRAINT "ticket_description_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "ticket_description" DROP CONSTRAINT "ticket_description_ticketId_fkey";

-- DropForeignKey
ALTER TABLE "ticket_watch" DROP CONSTRAINT "ticket_watch_ticketId_fkey";

-- DropForeignKey
ALTER TABLE "ticket_watch" DROP CONSTRAINT "ticket_watch_userId_fkey";

-- DropTable
DROP TABLE "ticket_description";

-- DropTable
DROP TABLE "ticket_watch";
