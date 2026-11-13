"use client";

import type { LucideIcon } from "lucide-react";
import { ActivityIcon, ClockIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CollapsibleSectionCard } from "@/components/collapsible-section-card";
import { DeviceQuestionAccordionItem } from "@/components/device-question-accordion-item";
import { Accordion } from "@/components/ui/accordion";
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

// Of the stub questions, only the timing one has data behind it. The card
// also shows the device-guide item "How are these devices typically used in
// hospitals?", which is built from the linked products, not from this list.
// The other questions are kept here, commented out, until VIPER can answer
// them from real data:
//
// {
//   id: "technical",
//   icon: MonitorIcon,
//   question: "What technical systems are impacted by this work order?",
//   answer:
//     "A summary of the systems, services, and dependencies this work order affects will appear here.",
// },
// {
//   id: "clinical",
//   icon: ActivitySquareIcon,
//   question: "How are clinical systems impacted by this work order?",
//   answer:
//     "A summary of the clinical impact, including any effect on patient-facing workflows during the change, will appear here.",
// },
// {
//   id: "validation",
//   icon: ShieldCheckIcon,
//   question: "What post-completion validation is required?",
//   answer:
//     "The checks required to confirm the work is complete and the systems are healthy will appear here.",
// },
// {
//   id: "approval",
//   icon: UserCheckIcon,
//   question: "Who do I need approval from to complete this work order?",
//   answer:
//     "The roles and stakeholders whose sign-off is required before this work proceeds will appear here.",
// },
const buildQuestions = (assetIds: string[]): StubQuestion[] => [
  {
    id: "timing",
    icon: ClockIcon,
    question: "What are good times to complete this work order?",
    answer: (
      <div className="space-y-3">
        <p className="text-muted-foreground">
          Currently, VIPER surfaces asset utilization data when available to
          suggest work order completion times to users. VIPER is exploring other
          data sources to help suggest the best times to users.
        </p>
        <AssetUtilizationAnswer assetIds={assetIds} />
      </div>
    ),
  },
];

function toPageProducts(assets: CardAsset[]): PageProduct[] {
  const byId = new Map<string, PageProduct>();
  for (const asset of assets) {
    if (!asset.productId || !asset.product || byId.has(asset.productId))
      continue;
    byId.set(asset.productId, {
      productId: asset.productId,
      product: asset.product.canonicalDisplayName,
      deviceTypeId: asset.product.deviceTypeId,
    });
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
            showSubtitle
          >
            <DeviceGuideList products={products} />
          </DeviceQuestionAccordionItem>
        )}
        {buildQuestions(assetIds).map(({ id, icon, question, answer }) => (
          <DeviceQuestionAccordionItem
            key={id}
            value={id}
            icon={icon}
            title={question}
          >
            {answer}
          </DeviceQuestionAccordionItem>
        ))}
      </Accordion>
    </CollapsibleSectionCard>
  );
};
