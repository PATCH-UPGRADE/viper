-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('PENDING', 'FALSE_POSITIVE', 'REMEDIATED');

-- CreateTable
CREATE TABLE "issue" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "vulnerabilityId" TEXT NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "issue_assetId_vulnerabilityId_key" ON "issue"("assetId", "vulnerabilityId");

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_vulnerabilityId_fkey" FOREIGN KEY ("vulnerabilityId") REFERENCES "vulnerability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
