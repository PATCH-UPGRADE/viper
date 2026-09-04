"use client";

import type { LucideIcon } from "lucide-react";
import {
  ActivitySquareIcon,
  ClockIcon,
  MonitorIcon,
  ShieldCheckIcon,
  UserCheckIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AssetUtilizationAnswer } from "@/features/assets/components/asset-utilization-grid";
import { CollapsibleSectionCard } from "./section-card";

type StubQuestion = {
  id: string;
  icon: LucideIcon;
  question: string;
  answer: ReactNode;
};

// TODO: Replace these stub questions with real data
const buildQuestions = (assetIds: string[]): StubQuestion[] => [
  {
    id: "technical",
    icon: MonitorIcon,
    question: "What technical systems are impacted by this work order?",
    answer:
      "A summary of the systems, services, and dependencies this work order affects will appear here.",
  },
  {
    id: "clinical",
    icon: ActivitySquareIcon,
    question: "How are clinical systems impacted by this work order?",
    answer:
      "A summary of the clinical impact, including any effect on patient-facing workflows during the change, will appear here.",
  },
  {
    id: "validation",
    icon: ShieldCheckIcon,
    question: "What post-completion validation is required?",
    answer:
      "The checks required to confirm the work is complete and the systems are healthy will appear here.",
  },
  {
    id: "approval",
    icon: UserCheckIcon,
    question: "Who do I need approval from to complete this work order?",
    answer:
      "The roles and stakeholders whose sign-off is required before this work proceeds will appear here.",
  },
  {
    id: "timing",
    icon: ClockIcon,
    question: "What are good times to complete this work order?",
    answer:
      assetIds.length > 0 ? (
        <AssetUtilizationAnswer assetIds={assetIds} />
      ) : (
        "Recommended maintenance windows that minimize disruption to the affected services will appear here."
      ),
  },
];

export const AdditionalDetailsCard = ({ assetIds }: { assetIds: string[] }) => (
  <CollapsibleSectionCard title="Additional Details">
    <Accordion type="single" collapsible className="w-full">
      {buildQuestions(assetIds).map(({ id, icon: Icon, question, answer }) => (
        <AccordionItem key={id} value={id}>
          <AccordionTrigger className="text-sm hover:no-underline">
            <span className="flex items-center gap-2.5 text-left">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              {question}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pl-[26px] text-sm text-muted-foreground">
            {answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  </CollapsibleSectionCard>
);
