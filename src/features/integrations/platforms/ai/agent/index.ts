import "server-only";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type { z } from "zod";
import { buildAgentGraph } from "@/features/agents/shared/build-graph";
import type { AuthCredential } from "@/features/integrations/core/credentials";
import { makeFetchUrlTool } from "./fetch-tool";
import { type CrawlResult, resolveCrawl } from "./outcome";
import { buildCrawlerPreload, buildCrawlerPrompt } from "./prompt";
import { makeRecorder } from "./record-tool";
import { CRAWLER_ITEM_SCHEMAS, type CrawlerResource } from "./schemas";

const CRAWLER_MODEL = "gpt-6.1-sol";

/**
 * Super-step budget for one crawl. Each tool round costs two super-steps
 * (model, then tools), and a page takes two rounds (fetch, then record), so
 * this stops a crawl near twenty pages. LangGraph's default of 25 stops it near
 * six.
 */
const CRAWLER_RECURSION_LIMIT = 80;

export type CrawledItem<R extends CrawlerResource> = z.infer<
  (typeof CRAWLER_ITEM_SCHEMAS)[R]
>;

/**
 * Crawl the integration URL and return the items the model recorded, with
 * the reason when the crawl stopped early.
 *
 * The graph binds only its own two tools. The shared registry holds
 * HALT_TOOLS, which end the run to wait for a person, and nobody answers
 * a sync job.
 */
export async function runAiCrawler<R extends CrawlerResource>({
  resource,
  integrationUri,
  additionalInstructions,
  creds,
  knownExternalIds,
}: {
  resource: R;
  integrationUri: string;
  additionalInstructions?: string;
  creds: AuthCredential;
  /** externalIds from earlier syncs, so the model keeps their pattern. */
  knownExternalIds: string[];
}): Promise<CrawlResult<CrawledItem<R>>> {
  // TypeScript does not narrow a map lookup by a generic key.
  const itemSchema = CRAWLER_ITEM_SCHEMAS[resource] as unknown as z.ZodType<
    CrawledItem<R>
  >;
  const recorder = makeRecorder(itemSchema);
  const tools = [
    makeFetchUrlTool({ integrationUri, creds }),
    recorder.recordTool,
    recorder.reportTool,
  ];

  // Reasoning tokens count toward maxTokens, so leave room for a page of record_items arguments.
  const model = new ChatOpenAI({
    model: CRAWLER_MODEL,
    maxTokens: 16000,
    useResponsesApi: true,
    reasoning: { effort: "medium" },
  }).bindTools(tools);

  const graph = buildAgentGraph({
    model,
    tools,
    systemMessage: new SystemMessage(
      buildCrawlerPrompt({ resource, integrationUri, additionalInstructions }),
    ),
    preload: async () =>
      buildCrawlerPreload({
        resource,
        integrationUri,
        authType: creds.authType,
        knownExternalIds,
      }),
  });

  // The recorder lives outside the graph, so what it holds survives an error.
  let error: unknown;
  try {
    await graph.invoke(
      {
        messages: [new HumanMessage("Crawl the integration and record items.")],
      },
      { recursionLimit: CRAWLER_RECURSION_LIMIT },
    );
  } catch (caught) {
    error = caught;
  }
  return resolveCrawl(recorder.recorded(), error);
}
