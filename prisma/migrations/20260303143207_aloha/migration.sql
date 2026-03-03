-- CreateEnum
CREATE TYPE "AlohaStatus" AS ENUM ('Confirmed', 'Unsure');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TriggerEnum" ADD VALUE 'Remediation_Created';
ALTER TYPE "TriggerEnum" ADD VALUE 'Remediation_Updated';
ALTER TYPE "TriggerEnum" ADD VALUE 'Vulnerability_Created';
ALTER TYPE "TriggerEnum" ADD VALUE 'Vulnerability_Updated';

-- AlterTable
ALTER TABLE "remediation" ADD COLUMN     "alohaLog" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "alohaStatus" "AlohaStatus";

-- AlterTable
ALTER TABLE "vulnerability" ADD COLUMN     "alohaLog" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "alohaStatus" "AlohaStatus";
