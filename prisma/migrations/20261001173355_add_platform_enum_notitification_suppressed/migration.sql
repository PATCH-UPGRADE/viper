-- AlterEnum
ALTER TYPE "PlatformEnum" ADD VALUE 'CSAF';

-- AlterTable
ALTER TABLE "notification" ADD COLUMN     "suppressed" BOOLEAN NOT NULL DEFAULT false;
