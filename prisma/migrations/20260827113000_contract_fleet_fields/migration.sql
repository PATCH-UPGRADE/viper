-- AlterTable
ALTER TABLE "contract" DROP COLUMN "coverageSummary",
ADD COLUMN     "termsJson" JSONB;

