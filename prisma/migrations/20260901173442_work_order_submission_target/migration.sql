-- CreateEnum
CREATE TYPE "SubmissionState" AS ENUM ('NONE', 'PENDING', 'SUBMITTING', 'SUBMITTED', 'FAILED');

-- AlterTable
ALTER TABLE "work_order_ticket"
  ADD COLUMN "targetIntegrationId" TEXT,
  ADD COLUMN "platformPayload"     JSONB,
  ADD COLUMN "submissionState"     "SubmissionState" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "submissionError"     TEXT,
  ADD COLUMN "submittedAt"         TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "work_order_ticket_submissionState_idx" ON "work_order_ticket"("submissionState");
CREATE INDEX "work_order_ticket_targetIntegrationId_idx" ON "work_order_ticket"("targetIntegrationId");

-- AddForeignKey
-- SET NULL, matching how manages_relationship names the same integration. The
-- pointer must not block removing an integration a work order once reached.
ALTER TABLE "work_order_ticket"
  ADD CONSTRAINT "work_order_ticket_targetIntegrationId_fkey"
  FOREIGN KEY ("targetIntegrationId") REFERENCES "integration"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: a ticket that already carries an external mapping was filed on a
-- vendor platform before this column existed. Mark it SUBMITTED so the new
-- submitter never files it a second time, and take its target from the mapping.
-- Only tickets whose mappings all point at one integration are targeted; a
-- ticket spanning two has no single target and is left null.
UPDATE "work_order_ticket" t
SET "submissionState"     = 'SUBMITTED',
    "submittedAt"         = COALESCE(m."lastSynced", m."createdAt"),
    "targetIntegrationId" = m."integrationId"
FROM (
  SELECT "itemId",
         MIN("integrationId") AS "integrationId",
         MIN("lastSynced")    AS "lastSynced",
         MIN("createdAt")     AS "createdAt"
  FROM "external_work_order_mappings"
  GROUP BY "itemId"
  HAVING count(DISTINCT "integrationId") = 1
) m
WHERE m."itemId" = t.id;
