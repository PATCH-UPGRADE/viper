import type { NoteStatus, ScopeTargetModel } from "@/generated/prisma";
export type NoteScopeInput =
  | { kind: "instance"; targetModel: ScopeTargetModel; instanceId: string }
  | { kind: "filter"; targetModel: ScopeTargetModel };

export type CreateNoteInput = {
  text: string;
  userId: string | null;
  scope: NoteScopeInput;
  status?: NoteStatus;
  skipDuplicate: boolean;
};

export type ChatNoteInput = {
  comment: string;
  targetModel: ScopeTargetModel;
  instanceId: string;
  userId: string;
};
