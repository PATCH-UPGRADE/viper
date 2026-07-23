import type { inferOutput } from "@trpc/tanstack-react-query";
import type { trpc } from "@/trpc/server";

export type MitigationPlanWithWorkOrders = inferOutput<
  typeof trpc.mitigation.getForNotification
>[number];

export type PlanWorkOrder = MitigationPlanWithWorkOrders["workOrders"][number];
