-- Drop the sourceWorkflow foreign key + index before reworking the column.
ALTER TABLE "work_order_ticket" DROP CONSTRAINT "work_order_ticket_sourceWorkflowId_fkey";
DROP INDEX "work_order_ticket_sourceWorkflowId_idx";

-- Recreate the TicketSource enum with the new value set, mapping existing rows:
--   WORKFLOW -> OTHER, WEBHOOK/API -> INTEGRATION, MANUAL -> MANUAL.
ALTER TYPE "TicketSource" RENAME TO "TicketSource_old";
CREATE TYPE "TicketSource" AS ENUM ('MANUAL', 'EMAIL', 'INTEGRATION', 'OTHER');

ALTER TABLE "work_order_ticket" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "work_order_ticket"
  ALTER COLUMN "source" TYPE "TicketSource"
  USING (
    CASE "source"::text
      WHEN 'WORKFLOW' THEN 'OTHER'
      WHEN 'WEBHOOK' THEN 'INTEGRATION'
      WHEN 'API' THEN 'INTEGRATION'
      ELSE 'MANUAL'
    END::"TicketSource"
  );
ALTER TABLE "work_order_ticket" ALTER COLUMN "source" SET DEFAULT 'MANUAL';
DROP TYPE "TicketSource_old";

-- Replace the workflow FK with a generic source label (email address / service
-- name / free text). MANUAL tickets leave this null and use the creator.
ALTER TABLE "work_order_ticket" DROP COLUMN "sourceWorkflowId";
ALTER TABLE "work_order_ticket" ADD COLUMN "sourceLabel" TEXT;
