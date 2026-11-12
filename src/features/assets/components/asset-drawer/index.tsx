"use client";

import {
  BugIcon,
  FileText,
  MessageSquare,
  ServerIcon,
  Wrench,
} from "lucide-react";
import { DashboardDrawerShell } from "@/components/dashboard-drawers";
import { Badge } from "@/components/ui/badge";
import { AIChat } from "@/features/chat/components/chat";
import { useChatUI } from "@/features/chat/context/chat-panel-context";
import {
  type SuggestedQuestion,
  SuggestedQuestionsProvider,
} from "@/features/chat/context/suggested-questions-context";
import type { UserRole } from "@/features/chat/utils";
import { DrawerIssuesList } from "@/features/issues/components/issue";
import { RemediationCardList } from "@/features/remediations/components/remediations";
import { relativeTime } from "@/lib/date-utils";
import type { AssetWithIssueRelations } from "../../types";
import {
  getAssetDeviceTypeLabel,
  getAssetTitle,
  securityRemediationsOf,
} from "../../utils";
import { assetStatusVariant, OverviewSection } from "./overview-section";

interface AssetDashboardDrawerProps {
  asset: AssetWithIssueRelations;
  open: boolean;
  setOpen: (open: boolean) => void;
  children?: React.ReactNode;
}

/**
 * An asset with no product falls back to getAssetTitle (its device type, or "Unknown Asset").
 */
function AssetDrawerTitle({ asset }: { asset: AssetWithIssueRelations }) {
  const product = asset.product?.canonicalDisplayName;
  const deviceType = getAssetDeviceTypeLabel(asset);
  if (!product) return getAssetTitle(asset);
  return (
    <span className="flex flex-wrap items-center gap-x-1.5">
      <span>{product}</span>
      {deviceType && (
        <span className="text-[0.8em] font-medium">&bull; {deviceType}</span>
      )}
    </span>
  );
}

export function AssetDashboardDrawer({
  asset,
  open,
  setOpen,
  children,
}: AssetDashboardDrawerProps) {
  const { userRole } = useChatUI();

  const remediations = securityRemediationsOf(asset.issues);

  const suggestedQuestions: Partial<Record<UserRole, SuggestedQuestion[]>> = {
    CISO: [
      { label: "Advise me on creating a remediation plan for this asset." },
      { label: "What is the overall risk posture of this asset?" },
      {
        label:
          "What is the potential business impact if this asset is compromised?",
      },
    ],
    "Clinical Staff": [
      { label: "How does this asset affect patient care workflows?" },
      {
        label:
          "What happens to patient monitoring if this device goes offline?",
      },
      {
        label:
          "What should we do about any patient-safety risks on this device?",
      },
    ],
    "IT staff": [
      { label: "Advise me on creating a remediation plan for this asset." },
      {
        label:
          "When should we schedule this work, and how much downtime will it need?",
      },
      { label: "Are there dependencies on other systems?" },
    ],
    "hospital administration": [
      { label: "Advise me on creating a remediation plan for this asset." },
      { label: "How does this affect our regulatory compliance?" },
      {
        label:
          "Should we act now or can this wait, and what is the risk either way?",
      },
    ],
    "biomedical engineer": [
      { label: "Advise me on creating a remediation plan for this asset." },
      { label: "Are there manufacturer advisories for this device?" },
      { label: "How would applying this patch affect patient care?" },
    ],
  };
  const visibleQuestions = suggestedQuestions[userRole] ?? [];

  const tabs = [
    {
      value: "overview",
      label: "Overview",
      icon: FileText,
      content: <OverviewSection asset={asset} />,
    },
    {
      value: "vulnerabilities",
      label: "Vulnerabilities",
      icon: BugIcon,
      count: asset.issues.length,
      content: (
        <DrawerIssuesList
          issues={asset.issues}
          type="vulnerabilities"
          assetId={asset.id}
        />
      ),
    },
    {
      value: "remediations",
      label: "Remediations",
      icon: Wrench,
      count: remediations.length,
      content: <RemediationCardList remediations={remediations} />,
    },
    {
      value: "chat",
      label: "AI Chat",
      icon: MessageSquare,
      content: (
        <SuggestedQuestionsProvider questions={visibleQuestions}>
          <AIChat config={{ assetId: asset.id }} />
        </SuggestedQuestionsProvider>
      ),
      rawContent: true,
    },
  ];

  const description = (
    <>
      <Badge variant="outline" className="text-primary">
        <ServerIcon className="size-3 mr-1" />
        Hospital Asset
      </Badge>
      {asset.status && (
        <Badge variant={assetStatusVariant(asset.status)}>{asset.status}</Badge>
      )}
      <span className="text-sm">Updated {relativeTime(asset.updatedAt)}</span>
    </>
  );

  return (
    <DashboardDrawerShell
      open={open}
      setOpen={setOpen}
      title={<AssetDrawerTitle asset={asset} />}
      description={description}
      tabs={tabs}
    >
      {children}
    </DashboardDrawerShell>
  );
}
