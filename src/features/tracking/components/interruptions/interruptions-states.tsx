import { ErrorView, LoadingView } from "@/components/entity-components";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import type { InterruptionScope } from "../../server/interruptions";

const messages: Record<
  Exclude<InterruptionScope, "ready">,
  { title: string; description: string }
> = {
  "no-department": {
    title: "You're not assigned to a department",
    description:
      "Maintenance is shown by department. Ask an administrator to add you to one.",
  },
  "no-assets": {
    title: "Your department doesn't manage any devices yet",
    description:
      "Once devices are assigned to your department, their maintenance appears here.",
  },
};

export const ScopeEmpty = ({
  scope,
}: {
  scope: Exclude<InterruptionScope, "ready">;
}) => (
  <Empty className="m-4 border border-dashed">
    <EmptyHeader>
      <EmptyTitle>{messages[scope].title}</EmptyTitle>
      <EmptyDescription>{messages[scope].description}</EmptyDescription>
    </EmptyHeader>
  </Empty>
);

export const InterruptionsLoading = () => (
  <LoadingView message="Loading maintenance..." />
);

export const InterruptionsError = () => (
  <ErrorView message="Error loading maintenance" />
);
