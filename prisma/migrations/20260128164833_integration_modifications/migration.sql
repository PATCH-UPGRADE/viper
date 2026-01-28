-- AlterEnum
ALTER TYPE "AuthType" ADD VALUE 'None';

-- AlterTable
ALTER TABLE "integration" ADD COLUMN     "prompt" TEXT,
ALTER COLUMN "authentication" DROP NOT NULL;
