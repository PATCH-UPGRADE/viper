/*
  Warnings:

  - A unique constraint covering the columns `[cveId]` on the table `vulnerability` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('Critical', 'High', 'Medium', 'Low');

-- AlterTable
ALTER TABLE "vulnerability" ADD COLUMN     "affectedComponents" TEXT[] NOT NULL DEFAULT '{}',
ADD COLUMN     "cveId" TEXT,
ADD COLUMN     "cvssScore" DOUBLE PRECISION,
ADD COLUMN     "cvssVector" TEXT,
ADD COLUMN     "severity" "Severity" NOT NULL DEFAULT 'Medium',
ALTER COLUMN "exploit-uri" DROP NOT NULL,
ALTER COLUMN "upstream-api" DROP NOT NULL,
ALTER COLUMN "description" DROP NOT NULL,
ALTER COLUMN "narrative" DROP NOT NULL,
ALTER COLUMN "impact" DROP NOT NULL;

-- CreateTable
CREATE TABLE "issue_remediation" (
    "issueId" TEXT NOT NULL,
    "remediationId" TEXT NOT NULL,

    CONSTRAINT "issue_remediation_pkey" PRIMARY KEY ("issueId","remediationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "vulnerability_cveId_key" ON "vulnerability"("cveId");

-- CreateIndex
CREATE INDEX "vulnerability_severity_idx" ON "vulnerability"("severity");

-- AddForeignKey
ALTER TABLE "issue_remediation" ADD CONSTRAINT "issue_remediation_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_remediation" ADD CONSTRAINT "issue_remediation_remediationId_fkey" FOREIGN KEY ("remediationId") REFERENCES "remediation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
