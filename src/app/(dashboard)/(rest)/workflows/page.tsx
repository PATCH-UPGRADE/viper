import {
  WorkflowsContainer,
  WorkflowsList,
  WorkflowsLoading,
  WorkflowsError,
} from "@/features/workflows/components/workflows";
import { workflowsParamsLoader } from "@/features/workflows/server/params-loader";
import { prefetchWorkflows } from "@/features/workflows/server/prefetch";
import { createListPage } from "@/lib/page-factory";

export default createListPage({
  paramsLoader: workflowsParamsLoader,
  prefetch: prefetchWorkflows,
  Container: WorkflowsContainer,
  List: WorkflowsList,
  Loading: WorkflowsLoading,
  Error: WorkflowsError,
});
