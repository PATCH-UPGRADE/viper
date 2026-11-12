-- DropForeignKey
ALTER TABLE "source_record" DROP CONSTRAINT "source_record_remediationId_fkey";

-- DropIndex
DROP INDEX "source_record_remediationId_idx";

-- AlterTable
ALTER TABLE "source_record" DROP COLUMN "remediationId";

