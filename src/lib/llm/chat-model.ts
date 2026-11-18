import "server-only";
import { getTokenProvider } from "@aws/bedrock-token-generator";
import { ChatOpenAI } from "@langchain/openai";
import { type ModelKey, models } from "./models";

// GPT models on bedrock-runtime run only through a cross-Region inference profile.
const BEDROCK_PROFILE_PREFIX = "us.openai.";

// Created once per process. It turns the AWS access key + secret into a short-term
// Bedrock API key, signed locally (no network call).
let provideBedrockKey: (() => Promise<string>) | undefined;

/** The model ID an agent runs on in this deployment. */
export function resolveModelId(key: ModelKey): string {
  const model = models[key].model;
  if (process.env.BEDROCK_REGION) return `${BEDROCK_PROFILE_PREFIX}${model}`;
  return model;
}

/** Build the chat model for one agent from its entry in models.ts.
 * AWS: https://docs.langchain.com/oss/javascript/integrations/chat/openai
 */
export function createChatModel(key: ModelKey): ChatOpenAI {
  const region = process.env.BEDROCK_REGION;
  // Vercel and local dev: OpenAI, exactly as today
  if (!region) return new ChatOpenAI(models[key]);

  // AWS: the same class and settings, sent to Bedrock's OpenAI-compatible Responses API
  if (!provideBedrockKey) {
    provideBedrockKey = getTokenProvider({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return new ChatOpenAI({
    ...models[key],
    model: resolveModelId(key),
    apiKey: provideBedrockKey,
    configuration: {
      baseURL: `https://bedrock-runtime.${region}.amazonaws.com/openai/v1`,
    },
    zdrEnabled: true, // zero data retention: without it Bedrock keeps every input and output for 30 days.
  });
}
