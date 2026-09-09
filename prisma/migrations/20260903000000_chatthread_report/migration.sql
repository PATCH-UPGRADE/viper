-- Add the optional Markdown report written by the write_report agent tool.
-- A ChatThread with a non-null report shows up under /reports (VW-493).
ALTER TABLE "ChatThread" ADD COLUMN "report" TEXT;
