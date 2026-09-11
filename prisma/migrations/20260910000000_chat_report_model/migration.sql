-- Split ChatThread.report (a plain TEXT column) into its own ChatReport model,
-- 1:1 via ChatThread.reportId (@unique). Existing report strings are preserved:
-- one ChatReport row per thread that had a non-null report. Drop @unique later
-- to allow one-report / many-threads.

-- 1. New table.
CREATE TABLE "ChatReport" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatReport_pkey" PRIMARY KEY ("id")
);

-- 2. Nullable FK column.
ALTER TABLE "ChatThread" ADD COLUMN "reportId" TEXT;

-- 3. Move data. Reuse the thread id as the report id — opaque, guaranteed
--    unique, no id generation needed in raw SQL.
INSERT INTO "ChatReport" ("id", "content", "createdAt", "updatedAt")
SELECT "id", "report", "createdAt", "updatedAt"
FROM "ChatThread"
WHERE "report" IS NOT NULL;

UPDATE "ChatThread"
SET "reportId" = "id"
WHERE "report" IS NOT NULL;

-- 4. Drop the old column.
ALTER TABLE "ChatThread" DROP COLUMN "report";

-- 5. Unique index + FK, matching Prisma's default naming and delete behaviour.
CREATE UNIQUE INDEX "ChatThread_reportId_key" ON "ChatThread"("reportId");
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_reportId_fkey"
    FOREIGN KEY ("reportId") REFERENCES "ChatReport"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
