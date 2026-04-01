-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('PARTNER', 'AI', 'CSAF');

-- CreateEnum
CREATE TYPE "Tlp" AS ENUM ('WHITE', 'GREEN', 'AMBER', 'RED', 'CLEAR', 'AMBER_STRICT');

-- Step 1: Add integrationType as nullable to migrate existing data
ALTER TABLE "integration" ADD COLUMN "integrationType" "IntegrationType";

-- Step 2: Migrate existing rows: isGeneric=true → AI, isGeneric=false → PARTNER
UPDATE "integration" SET "integrationType" = 'AI'::"IntegrationType" WHERE "isGeneric" = true;
UPDATE "integration" SET "integrationType" = 'PARTNER'::"IntegrationType" WHERE "isGeneric" = false;

-- Step 3: Make NOT NULL now that all rows are populated
ALTER TABLE "integration" ALTER COLUMN "integrationType" SET NOT NULL;

-- Step 4: Drop the old column
ALTER TABLE "integration" DROP COLUMN "isGeneric";

-- CreateTable
CREATE TABLE "advisory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "csaf" JSONB NOT NULL DEFAULT '{}',
    "upstreamUrl" TEXT,
    "severity" "Severity" NOT NULL,
    "summary" TEXT,
    "status" "IssueStatus" NOT NULL DEFAULT 'ACTIVE',
    "tlp" "Tlp",
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advisory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_advisory_mappings" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSynced" TIMESTAMP(3),

    CONSTRAINT "external_advisory_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable (implicit M2M: advisory <-> vulnerability)
CREATE TABLE "_AdvisoryVulnerabilities" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AdvisoryVulnerabilities_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable (implicit M2M: advisory <-> device_group)
CREATE TABLE "_AdvisoryDeviceGroups" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AdvisoryDeviceGroups_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "advisory_upstreamUrl_key" ON "advisory"("upstreamUrl");

-- CreateIndex
CREATE INDEX "advisory_userId_idx" ON "advisory"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "external_advisory_mappings_itemId_integrationId_key" ON "external_advisory_mappings"("itemId", "integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "external_advisory_mappings_integrationId_externalId_key" ON "external_advisory_mappings"("integrationId", "externalId");

-- CreateIndex
CREATE INDEX "external_advisory_mappings_itemId_idx" ON "external_advisory_mappings"("itemId");

-- CreateIndex
CREATE INDEX "_AdvisoryVulnerabilities_B_index" ON "_AdvisoryVulnerabilities"("B");

-- CreateIndex
CREATE INDEX "_AdvisoryDeviceGroups_B_index" ON "_AdvisoryDeviceGroups"("B");

-- AddColumn
ALTER TABLE "advisory" ADD COLUMN "title" TEXT;

-- AddForeignKey
ALTER TABLE "advisory" ADD CONSTRAINT "advisory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_advisory_mappings" ADD CONSTRAINT "external_advisory_mappings_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "advisory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_advisory_mappings" ADD CONSTRAINT "external_advisory_mappings_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AdvisoryVulnerabilities" ADD CONSTRAINT "_AdvisoryVulnerabilities_A_fkey" FOREIGN KEY ("A") REFERENCES "advisory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AdvisoryVulnerabilities" ADD CONSTRAINT "_AdvisoryVulnerabilities_B_fkey" FOREIGN KEY ("B") REFERENCES "vulnerability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AdvisoryDeviceGroups" ADD CONSTRAINT "_AdvisoryDeviceGroups_A_fkey" FOREIGN KEY ("A") REFERENCES "advisory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AdvisoryDeviceGroups" ADD CONSTRAINT "_AdvisoryDeviceGroups_B_fkey" FOREIGN KEY ("B") REFERENCES "device_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
