-- DropForeignKey
ALTER TABLE "asset" DROP CONSTRAINT "asset_userId_fkey";

-- AlterTable
ALTER TABLE "asset" DROP COLUMN "userId";
