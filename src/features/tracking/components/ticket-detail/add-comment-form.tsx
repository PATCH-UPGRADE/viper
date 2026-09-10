"use client";

import { useState } from "react";
import { ActorAvatar } from "@/components/activity-timeline";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import { authClient } from "@/lib/auth-client";
import { useAddTicketComment } from "../../hooks/use-tracking";

export const AddCommentForm = ({ ticketId }: { ticketId: string }) => {
  const [body, setBody] = useState("");
  const addComment = useAddTicketComment(ticketId);
  const { data: session } = authClient.useSession();
  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && !addComment.isPending;

  // Warn before navigating away if there's an unsent comment.
  useBeforeUnload(trimmed.length > 0);

  const submit = () => {
    if (!canSubmit) return;
    addComment.mutate(
      { ticketId, body: trimmed },
      {
        onSuccess: () => {
          setBody("");
        },
      },
    );
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex gap-3"
    >
      <ActorAvatar
        actor={{
          name: session?.user?.name ?? null,
          image: session?.user?.image ?? null,
          isAgent: false,
        }}
      />
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment..."
          rows={3}
          disabled={addComment.isPending}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex justify-end gap-2">
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {addComment.isPending ? "Posting..." : "Comment"}
          </Button>
        </div>
      </div>
    </form>
  );
};
