-- Composite index for the /reports listing: filter by userId, order by updatedAt desc.
CREATE INDEX "ChatThread_userId_updatedAt_idx" ON "ChatThread"("userId", "updatedAt" DESC);
