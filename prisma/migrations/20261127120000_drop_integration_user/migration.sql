-- DropForeignKey
ALTER TABLE "integration" DROP CONSTRAINT "integration_integrationUserId_fkey";

-- DropIndex
DROP INDEX "integration_integrationUserId_idx";

-- DropIndex
DROP INDEX "integration_integrationUserId_key";

-- AlterTable
ALTER TABLE "integration" DROP COLUMN "integrationUserId",
ALTER COLUMN "userId" DROP NOT NULL;
