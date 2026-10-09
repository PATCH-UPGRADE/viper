"use client";

import { Suspense } from "react";
import { ReportingErrorBoundary } from "@/components/reporting-error-boundary";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  TicketDetailError,
  TicketDetailLoading,
  TicketDetailPage,
} from "../ticket-detail";

export const WorkOrderModal = ({ workOrderId }: { workOrderId: string }) => (
  <Dialog>
    <DialogTrigger asChild>
      <button type="button" className="text-primary hover:underline">
        View work order
      </button>
    </DialogTrigger>
    <DialogContent
      aria-describedby={undefined}
      className="max-h-[85vh] w-[95vw] max-w-5xl overflow-y-auto sm:max-w-5xl [&>[data-slot=dialog-close]]:top-2 [&>[data-slot=dialog-close]]:right-2 [&>[data-slot=dialog-close]]:p-2.5 [&>[data-slot=dialog-close]_svg]:size-6"
    >
      <DialogTitle className="sr-only">Work order</DialogTitle>
      <ReportingErrorBoundary fallback={<TicketDetailError />}>
        <Suspense fallback={<TicketDetailLoading />}>
          <TicketDetailPage id={workOrderId} embedded />
        </Suspense>
      </ReportingErrorBoundary>
    </DialogContent>
  </Dialog>
);
