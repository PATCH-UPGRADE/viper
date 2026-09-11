-- AlterEnum
ALTER TYPE "PlatformEnum" ADD VALUE 'MEDISAO';

-- AlterTable
ALTER TABLE "remediation" ADD COLUMN     "sourceImpact" JSONB NOT NULL DEFAULT '{}';
