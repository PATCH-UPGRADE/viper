-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('PENDING', 'FALSE_POSITIVE', 'REMEDIATED');

-- CreateTable
CREATE TABLE "issue" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "vulnerabilityId" TEXT NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "issue_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_vulnerabilityId_fkey" FOREIGN KEY ("vulnerabilityId") REFERENCES "vulnerability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
