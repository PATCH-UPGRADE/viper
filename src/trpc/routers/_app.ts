import { advisoriesRouter } from "@/features/advisories/server/routers";
import { apiKeyConnectorsRouter } from "@/features/api-key-connectors/server/routers";
import { artifactsRouter } from "@/features/artifacts/server/routers";
import { assetsRouter } from "@/features/assets/server/routers";
import { chatRouter } from "@/features/chat/server/routers";
import { deviceArtifactsRouter } from "@/features/device-artifacts/server/routers";
import { deviceGroupsRouter } from "@/features/device-groups/server/routers";
import { integrationsRouter } from "@/features/integrations/server/routers";
import { issuesRouter } from "@/features/issues/server/routers";
import { remediationsRouter } from "@/features/remediations/server/routers";
import { userRouter } from "@/features/user/server/routers";
import { vulnerabilitiesRouter } from "@/features/vulnerabilities/server/routers";
import { webhooksRouter } from "@/features/webhooks/server/routers";
import { workflowsRouter } from "@/features/workflows/server/routers";
import { createTRPCRouter } from "../init";

export const appRouter = createTRPCRouter({
  advisories: advisoriesRouter,
  workflows: workflowsRouter,
  assets: assetsRouter,
  vulnerabilities: vulnerabilitiesRouter,
  remediations: remediationsRouter,
  deviceArtifacts: deviceArtifactsRouter,
  user: userRouter,
  issues: issuesRouter,
  integrations: integrationsRouter,
  deviceGroups: deviceGroupsRouter,
  webhooks: webhooksRouter,
  artifacts: artifactsRouter,
  chat: chatRouter,
  apiKeyConnectors: apiKeyConnectorsRouter,
});
// export type definition of API
export type AppRouter = typeof appRouter;
