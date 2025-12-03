import { createTRPCRouter } from "../init";
import { workflowsRouter } from "@/features/workflows/server/routers";
import { assetsRouter } from "@/features/assets/server/routers";
import { vulnerabilitiesRouter } from "@/features/vulnerabilities/server/routers";
import { remediationsRouter } from "@/features/remediations/server/routers";
import { emulatorsRouter } from "@/features/emulators/server/routers";
import { userRouter } from "@/features/user/server/routers";

export const appRouter = createTRPCRouter({
  workflows: workflowsRouter,
  assets: assetsRouter,
  vulnerabilities: vulnerabilitiesRouter,
  remediations: remediationsRouter,
  emulators: emulatorsRouter,
  user: userRouter,
});
// export type definition of API
export type AppRouter = typeof appRouter;
