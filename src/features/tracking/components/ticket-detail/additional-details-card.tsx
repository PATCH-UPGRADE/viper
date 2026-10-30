"use client";

import type { LucideIcon } from "lucide-react";
import {
  ActivityIcon,
  ActivitySquareIcon,
  ClockIcon,
  MonitorIcon,
  ShieldCheckIcon,
  UserCheckIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { CollapsibleSectionCard } from "@/components/collapsible-section-card";
import { DeviceQuestionAccordionItem } from "@/components/device-question-accordion-item";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AssetUtilizationAnswer } from "@/features/assets/components/asset-utilization-grid";
import { DeviceGuideList } from "@/features/device-types/components/device-guide-list";
import {
  describeProducts,
  type PageProduct,
} from "@/features/device-types/device-guides";

type StubQuestion = {
  id: string;
  icon: LucideIcon;
  question: string;
  answer: ReactNode;
};

type CardAsset = {
  id: string;
  productId: string | null;
  product: { canonicalDisplayName: string; deviceTypeId: string | null } | null;
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

function toPageProducts(assets: CardAsset[]): PageProduct[] {
  const byId = new Map<string, PageProduct>();
  for (const asset of assets) {
    if (!asset.productId || !asset.product) continue;
    const entry = byId.get(asset.productId) ?? {
      productId: asset.productId,
      product: asset.product.canonicalDisplayName,
      deviceTypeId: asset.product.deviceTypeId,
      assetCount: 0,
    };
    entry.assetCount += 1;
    byId.set(asset.productId, entry);
  }
  return [...byId.values()];
}

export const AdditionalDetailsCard = ({ assets }: { assets: CardAsset[] }) => {
  const assetIds = assets.map((a) => a.id);
  const products = toPageProducts(assets);
  return (
    <CollapsibleSectionCard title="Additional Details">
      <Accordion type="single" collapsible className="w-full">
        {products.length > 0 && (
          <DeviceQuestionAccordionItem
            value="typical-usage"
            icon={ActivityIcon}
            title="How are these devices typically used in hospitals?"
            {...describeProducts(products)}
          >
            <DeviceGuideList products={products} />
          </DeviceQuestionAccordionItem>
        )}
        {buildQuestions(assetIds).map(
          ({ id, icon: Icon, question, answer }) => (
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
          ),
        )}
      </Accordion>
    </CollapsibleSectionCard>
  );
};
