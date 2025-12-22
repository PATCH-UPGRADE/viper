import { assetsRouter } from "@/features/assets/server/routers";
import { emulatorsRouter } from "@/features/emulators/server/routers";
import { issuesRouter } from "@/features/issues/server/routers";
import { remediationsRouter } from "@/features/remediations/server/routers";
import { userRouter } from "@/features/user/server/routers";
import { vulnerabilitiesRouter } from "@/features/vulnerabilities/server/routers";
import { workflowsRouter } from "@/features/workflows/server/routers";
import { createTRPCRouter } from "../init";

export const appRouter = createTRPCRouter({
  workflows: workflowsRouter,
  assets: assetsRouter,
  vulnerabilities: vulnerabilitiesRouter,
  remediations: remediationsRouter,
  emulators: emulatorsRouter,
  user: userRouter,
  issues: issuesRouter,
});
// export type definition of API
export type AppRouter = typeof appRouter;
