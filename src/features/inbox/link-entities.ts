import "server-only";
import { searchCandidates } from "./agent/candidate-search";
import { type ExtractResult, extractEntities } from "./agent/extract";
import { matchAndLinkEntities } from "./agent/match";
import type { InboundEmail } from "./agent/prompt";
import type { LinkEntities } from "./pipeline";

export const aiExtractAndMatch =
  (
    doc: InboundEmail,
    transform: (extracted: ExtractResult) => ExtractResult = (e) => e,
  ): LinkEntities =>
  async (step, notificationId, ctx) => {
    if (!ctx) throw new Error("aiExtractAndMatch needs the pipeline ctx");

    const extracted = await step.run(
      "extract-entities",
      async (): Promise<ExtractResult> =>
        transform(await extractEntities(ctx.sourceId, doc, ctx.attachments)),
    );
    if (!extracted) {
      return { linked: 0, updated: 0, created: 0, skipped: 0 };
    }

    return step.run("match-and-link-entities", async () => {
      if (
        !notificationId ||
        Object.values(extracted).every((v) => v.length === 0)
      ) {
        return { linked: 0, updated: 0, created: 0, skipped: 0 };
      }
      const candidates = await searchCandidates(extracted);
      return matchAndLinkEntities({ notificationId }, extracted, candidates);
    });
  };
