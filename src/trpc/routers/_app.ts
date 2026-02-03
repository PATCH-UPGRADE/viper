import { assetsRouter } from "@/features/assets/server/routers";
import { deviceGroupsRouter } from "@/features/device-groups/server/routers";
import { integrationsRouter } from "@/features/integrations/server/routers";
import { issuesRouter } from "@/features/issues/server/routers";
import { remediationsRouter } from "@/features/remediations/server/routers";
import { userRouter } from "@/features/user/server/routers";
import { vulnerabilitiesRouter } from "@/features/vulnerabilities/server/routers";
import { workflowsRouter } from "@/features/workflows/server/routers";
import { createTRPCRouter } from "../init";
import { deviceArtifactsRouter } from "@/features/device-artifacts/server/routers";

export const appRouter = createTRPCRouter({
  workflows: workflowsRouter,
  assets: assetsRouter,
  vulnerabilities: vulnerabilitiesRouter,
  remediations: remediationsRouter,
  deviceArtifacts: deviceArtifactsRouter,
  user: userRouter,
  issues: issuesRouter,
  integrations: integrationsRouter,
  deviceGroups: deviceGroupsRouter,
});
// export type definition of API
export type AppRouter = typeof appRouter;
