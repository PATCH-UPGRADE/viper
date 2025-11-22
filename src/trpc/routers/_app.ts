import { createTRPCRouter } from '../init';
import { workflowsRouter } from '@/features/workflows/server/routers';
import { assetsRouter } from '@/features/assets/server/routers';

export const appRouter = createTRPCRouter({
  workflows: workflowsRouter,
  assets: assetsRouter,
});
// export type definition of API
export type AppRouter = typeof appRouter;
