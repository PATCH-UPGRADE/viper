-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NodeType" ADD VALUE 'STEP';
ALTER TYPE "NodeType" ADD VALUE 'ASSET';

-- AlterTable
ALTER TABLE "Node" ADD COLUMN     "nodeTemplateId" TEXT;

-- CreateTable
CREATE TABLE "NodeTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "NodeType" NOT NULL,
    "icon" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodeTemplate_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Node" ADD CONSTRAINT "Node_nodeTemplateId_fkey" FOREIGN KEY ("nodeTemplateId") REFERENCES "NodeTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
