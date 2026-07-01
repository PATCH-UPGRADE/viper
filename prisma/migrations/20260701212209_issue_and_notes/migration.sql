/*
  Warnings:

  - The `status` column on the `advisory` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `issue` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[deviceGroupMatchingId,vulnerabilityId]` on the table `issue` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "IssueStatus_new" AS ENUM ('NOT_AFFECTED', 'AFFECTED', 'FIXED', 'UNDER_INVESTIGATION');

-- CreateEnum
CREATE TYPE "NotAffectedJustification" AS ENUM ('COMPONENT_NOT_PRESENT', 'VULNERABLE_CODE_NOT_PRESENT', 'VULNERABLE_CODE_NOT_IN_EXECUTE_PATH', 'VULNERABLE_CODE_CANNOT_BE_CONTROLLED_BY_ADVERSARY', 'INLINE_MITIGATIONS_ALREADY_EXIST', 'HOSPITAL_COMPENSATING_CONTROL', 'HOSPITAL_ACCEPTS_RISK');

-- CreateEnum
CREATE TYPE "NoteStatus" AS ENUM ('PERSISTENT', 'SCOPED');

-- CreateEnum
CREATE TYPE "ScopeTargetModel" AS ENUM ('DEVICE_GROUP', 'DEVICE_GROUP_MATCHING', 'ASSET', 'VULNERABILITY', 'REMEDIATION');

-- AlterTable
-- Remap "advisory"."status" to the new IssueStatus values without dropping
-- the column, so existing data is preserved instead of discarded.
ALTER TABLE "advisory" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "advisory" ALTER COLUMN "status" TYPE "IssueStatus_new"
  USING (
    CASE "status"::text
      WHEN 'ACTIVE'         THEN 'AFFECTED'
      WHEN 'FALSE_POSITIVE' THEN 'NOT_AFFECTED'
      WHEN 'REMEDIATED'     THEN 'FIXED'
    END
  )::"IssueStatus_new";
ALTER TABLE "advisory" ALTER COLUMN "status" SET DEFAULT 'AFFECTED';

-- AlterTable
ALTER TABLE "issue" ADD COLUMN     "deviceGroupMatchingId" TEXT,
ADD COLUMN     "notAffectedJustification" "NotAffectedJustification",
ADD COLUMN     "statusConfidence" "ConfidenceLevel",
ADD COLUMN     "statusNotes" TEXT,
ALTER COLUMN "assetId" DROP NOT NULL;

-- Remap "issue"."status" to the new IssueStatus values without dropping
-- the column, so existing per-asset issues keep their status
-- (ACTIVE->AFFECTED, FALSE_POSITIVE->NOT_AFFECTED, REMEDIATED->FIXED).
ALTER TABLE "issue" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "issue" ALTER COLUMN "status" TYPE "IssueStatus_new"
  USING (
    CASE "status"::text
      WHEN 'ACTIVE'         THEN 'AFFECTED'
      WHEN 'FALSE_POSITIVE' THEN 'NOT_AFFECTED'
      WHEN 'REMEDIATED'     THEN 'FIXED'
    END
  )::"IssueStatus_new";
ALTER TABLE "issue" ALTER COLUMN "status" SET DEFAULT 'AFFECTED';

-- DropEnum (old IssueStatus, now unreferenced since both columns were
-- repointed to IssueStatus_new above)
DROP TYPE "IssueStatus";

-- Rename the new enum into the name the old one vacated
ALTER TYPE "IssueStatus_new" RENAME TO "IssueStatus";

-- CreateTable
CREATE TABLE "note" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "NoteStatus" NOT NULL DEFAULT 'SCOPED',
    "userId" TEXT,
    "targetModel" "ScopeTargetModel",
    "instanceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_filter" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "targetModel" "ScopeTargetModel" NOT NULL,
    "filter" JSONB NOT NULL,
    "noteId" TEXT,
    "issueId" TEXT,
    "lastResolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_filter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_filter_match" (
    "id" TEXT NOT NULL,
    "entityFilterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_filter_match_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "note_targetModel_instanceId_idx" ON "note"("targetModel", "instanceId");

-- CreateIndex
CREATE INDEX "note_userId_idx" ON "note"("userId");

-- CreateIndex
CREATE INDEX "note_status_idx" ON "note"("status");

-- CreateIndex
CREATE INDEX "entity_filter_noteId_idx" ON "entity_filter"("noteId");

-- CreateIndex
CREATE INDEX "entity_filter_issueId_idx" ON "entity_filter"("issueId");

-- CreateIndex
CREATE INDEX "entity_filter_targetModel_idx" ON "entity_filter"("targetModel");

-- CreateIndex
CREATE INDEX "entity_filter_match_targetId_idx" ON "entity_filter_match"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "entity_filter_match_entityFilterId_targetId_key" ON "entity_filter_match"("entityFilterId", "targetId");

-- CreateIndex
CREATE INDEX "issue_assetId_idx" ON "issue"("assetId");

-- CreateIndex
CREATE INDEX "issue_deviceGroupMatchingId_idx" ON "issue"("deviceGroupMatchingId");

-- CreateIndex
CREATE INDEX "issue_vulnerabilityId_idx" ON "issue"("vulnerabilityId");

-- CreateIndex
CREATE UNIQUE INDEX "issue_deviceGroupMatchingId_vulnerabilityId_key" ON "issue"("deviceGroupMatchingId", "vulnerabilityId");

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_deviceGroupMatchingId_fkey" FOREIGN KEY ("deviceGroupMatchingId") REFERENCES "device_group_matching"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_filter" ADD CONSTRAINT "entity_filter_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_filter" ADD CONSTRAINT "entity_filter_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_filter_match" ADD CONSTRAINT "entity_filter_match_entityFilterId_fkey" FOREIGN KEY ("entityFilterId") REFERENCES "entity_filter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
