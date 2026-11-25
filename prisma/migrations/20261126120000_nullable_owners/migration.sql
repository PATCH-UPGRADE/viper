-- AlterTable
ALTER TABLE "artifact" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "artifact_wrapper" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "device_artifact" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "remediation" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "work_order_ticket" ALTER COLUMN "creatorId" DROP NOT NULL;
