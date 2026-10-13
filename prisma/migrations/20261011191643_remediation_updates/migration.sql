/*
  Warnings:

  - You are about to drop the column `sourceImpact` on the `remediation` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "RemediationMechanism" AS ENUM ('REMOTE_DEPLOYMENT', 'ON_SITE', 'REMOVABLE_MEDIA', 'OTHER');

-- CreateEnum
CREATE TYPE "ImpactPhase" AS ENUM ('DURING_APPLY', 'AFTER_APPLY');

-- CreateEnum
CREATE TYPE "ImpactEffect" AS ENUM ('UNAVAILABLE', 'DEGRADED', 'CHANGED');

-- AlterTable
ALTER TABLE "remediation" DROP COLUMN "sourceImpact",
ADD COLUMN     "category" TEXT,
ADD COLUMN     "disablesFeatures" BOOLEAN,
ADD COLUMN     "estimatedDowntimeSeconds" INTEGER,
ADD COLUMN     "estimatedDurationSeconds" INTEGER,
ADD COLUMN     "mechanism" "RemediationMechanism",
ADD COLUMN     "requiresDowntime" BOOLEAN,
ADD COLUMN     "restartRequired" BOOLEAN,
ADD COLUMN     "reversible" BOOLEAN,
ADD COLUMN     "verificationNotes" TEXT,
ADD COLUMN     "verificationRequired" BOOLEAN;

-- CreateTable
CREATE TABLE "remediation_impact" (
    "id" TEXT NOT NULL,
    "remediationId" TEXT NOT NULL,
    "phase" "ImpactPhase" NOT NULL,
    "feature" TEXT NOT NULL,
    "effect" "ImpactEffect" NOT NULL,
    "clinicalWorkflowImpact" BOOLEAN,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remediation_impact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "remediation_impact_remediationId_idx" ON "remediation_impact"("remediationId");

-- AddForeignKey
ALTER TABLE "remediation_impact" ADD CONSTRAINT "remediation_impact_remediationId_fkey" FOREIGN KEY ("remediationId") REFERENCES "remediation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
