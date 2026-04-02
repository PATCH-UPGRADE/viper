"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IssueStatus } from "@/generated/prisma";

export const statusDetails = {
  [IssueStatus.FALSE_POSITIVE]: {
    name: "False Positive",
    color: "bg-yellow-500",
  },
  [IssueStatus.ACTIVE]: { name: "Active", color: "bg-red-500" },
  [IssueStatus.REMEDIATED]: { name: "Remediated", color: "bg-green-500" },
};

export const IssueStatusBadge = ({ status }: { status: IssueStatus }) => {
  const statusDetail = statusDetails[status];
  return <Badge className={statusDetail.color}>{statusDetail.name}</Badge>;
};

export const StatusFormBase = ({
  id,
  initialStatus,
  onUpdate,
  className,
}: {
  id: string;
  initialStatus: IssueStatus;
  onUpdate: (input: { id: string; status: IssueStatus }) => Promise<unknown>;
  className?: string;
}) => {
  const [status, setStatus] = useState<IssueStatus>(initialStatus);
  const lastSubmittedStatusRef = useRef<IssueStatus>(initialStatus);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setStatus(initialStatus);
    lastSubmittedStatusRef.current = initialStatus;
  }, [initialStatus]);

  useEffect(() => {
    // Don't submit if status hasn't changed or if we already submitted this status
    if (status === initialStatus || status === lastSubmittedStatusRef.current) {
      return;
    }

    const requestId = ++requestIdRef.current;
    const updateStatus = async () => {
      lastSubmittedStatusRef.current = status;
      try {
        await onUpdate({ id, status });
      } catch {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setStatus(initialStatus);
        lastSubmittedStatusRef.current = initialStatus;
      }
    };

    updateStatus();
  }, [status, id, initialStatus, onUpdate]);

  const statusDetail = statusDetails[status];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        asChild
        onClick={(e) => e.stopPropagation()}
        className={className}
      >
        <Badge className={statusDetail.color}>
          {statusDetail.name} <ChevronDown className="ml-2" />
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {Object.values(IssueStatus)
          .filter((s) => s !== status)
          .map((s) => (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setStatus(s);
              }}
              key={s}
            >
              <IssueStatusBadge status={s} />
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
