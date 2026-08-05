import "server-only";
import type {
  NoteActionRequest,
  NoteActionSource,
} from "@/features/notes/agent/noteAction/context";
import type {
  MatchFeedbackTargetType,
  ScopeTargetModel,
} from "@/generated/prisma";
import prisma from "@/lib/db";
import { deviceGroupMatchingLabel } from "@/lib/markdown";

type ResolvedTarget = {
  targetModel: ScopeTargetModel;
  instanceId: string;
  label: string;
};

async function resolveMatchingFeedbackTarget(
  targetType: MatchFeedbackTargetType,
  targetId: string,
  notificationId: string,
): Promise<ResolvedTarget | null> {
  // if we need to target to different type later, remove this check and potentially update this function to a swtich(targetType)
  if (targetType !== "NotificationDeviceGroupMapping") return null;

  const mapping = await prisma.notificationDeviceGroupMapping.findFirst({
    where: { id: targetId, notificationId },
    select: {
      deviceGroupMatchingId: true,
      deviceGroupMatching: {
        select: {
          versionRange: true,
          manufacturer: { select: { canonicalDisplayName: true } },
          product: { select: { canonicalDisplayName: true } },
          version: { select: { canonicalDisplayName: true } },
        },
      },
    },
  });
  if (!mapping) return null;
  return {
    targetModel: "DEVICE_GROUP_MATCHING",
    instanceId: mapping.deviceGroupMatchingId,
    label: deviceGroupMatchingLabel(mapping.deviceGroupMatching),
  };
}

async function resolveMatchFeedbackRequest(
  matchFeedbackid: string,
): Promise<NoteActionRequest | null> {
  const feedback = await prisma.matchFeedback.findUnique({
    where: { id: matchFeedbackid },
    select: {
      comment: true,
      targetType: true,
      targetId: true,
      userId: true,
      notificationId: true,
      notification: { select: { title: true } },
    },
  });

  if (!feedback?.comment?.trim()) return null;
  if (!feedback.notificationId) return null;
  const target = await resolveMatchingFeedbackTarget(
    feedback.targetType,
    feedback.targetId,
    feedback.notificationId,
  );
  if (!target) return null;

  return {
    source: "MATCH_FEEDBACK",
    updatedText: feedback.comment,
    target: { targetModel: target.targetModel, instanceId: target.instanceId },
    targetLabel: target.label,
    userId: feedback.userId,
  };
}

// add other note source case here
export async function resolveNoteActionRequest(
  source: NoteActionSource,
  refId: string,
): Promise<NoteActionRequest | null> {
  switch (source) {
    case "MATCH_FEEDBACK":
      return resolveMatchFeedbackRequest(refId);
    default:
      return null;
  }
}
