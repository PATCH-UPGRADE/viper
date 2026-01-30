-- AlterEnum
ALTER TYPE "AuthType" ADD VALUE 'None';

-- AlterTable
ALTER TABLE "integration" ADD COLUMN     "integrationUserId" TEXT,
ADD COLUMN     "prompt" TEXT,
ALTER COLUMN "authentication" DROP NOT NULL;

-- AlterTable
ALTER TABLE "user" ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "integration_integrationUserId_idx" ON "integration"("integrationUserId");

-- AddForeignKey
ALTER TABLE "integration" ADD CONSTRAINT "integration_integrationUserId_fkey" FOREIGN KEY ("integrationUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
