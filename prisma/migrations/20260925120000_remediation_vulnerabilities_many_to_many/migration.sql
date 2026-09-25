-- CreateTable
CREATE TABLE "_RemediationVulnerabilities" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RemediationVulnerabilities_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_RemediationVulnerabilities_B_index" ON "_RemediationVulnerabilities"("B");

-- AddForeignKey
ALTER TABLE "_RemediationVulnerabilities" ADD CONSTRAINT "_RemediationVulnerabilities_A_fkey" FOREIGN KEY ("A") REFERENCES "remediation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RemediationVulnerabilities" ADD CONSTRAINT "_RemediationVulnerabilities_B_fkey" FOREIGN KEY ("B") REFERENCES "vulnerability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: must run before the column drop, or every existing link is lost.
INSERT INTO "_RemediationVulnerabilities" ("A", "B")
SELECT "id", "vulnerabilityId" FROM "remediation" WHERE "vulnerabilityId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "remediation" DROP CONSTRAINT "remediation_vulnerabilityId_fkey";

-- DropIndex
DROP INDEX "remediation_vulnerabilityId_idx";

-- AlterTable
ALTER TABLE "remediation" DROP COLUMN "vulnerabilityId";
