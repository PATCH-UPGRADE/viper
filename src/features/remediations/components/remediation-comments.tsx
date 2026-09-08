"use client";

import { formatDistanceToNow } from "date-fns";
import { InfoIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import {
  useAddRemediationComment,
  useRemediationComments,
} from "../hooks/use-remediations";

const MAX_BODY_LENGTH = 10_000;

/**
 * A pseudonym is stable within one remediation and uncorrelated across them, so
 * it is a handle for following a conversation and nothing more. Rendered as a
 * short label with a colour derived from the same hex, never as a profile
 * anyone can click into, and never presented as a person.
 *
 * The label carries the identity on its own, so the colour is decoration and no
 * meaning is lost without it.
 */
function PseudonymBadge({ pseudonym }: { pseudonym: string }) {
  const short = pseudonym.slice(0, 8);
  const hue = Number.parseInt(pseudonym.slice(0, 2), 16) * (360 / 256);

  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-xs"
      style={{
        backgroundColor: `oklch(0.9 0.05 ${hue})`,
        color: `oklch(0.35 0.09 ${hue})`,
      }}
    >
      {short}
    </span>
  );
}

function CommentComposer({ remediationId }: { remediationId: string }) {
  const [body, setBody] = useState("");
  const addComment = useAddRemediationComment(remediationId);
  const trimmed = body.trim();
  const canSubmit =
    trimmed.length > 0 &&
    trimmed.length <= MAX_BODY_LENGTH &&
    !addComment.isPending;

  useBeforeUnload(trimmed.length > 0);

  const submit = () => {
    if (!canSubmit) return;
    addComment.mutate(
      { remediationId, body: trimmed },
      { onSuccess: () => setBody("") },
    );
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-2"
    >
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Share what happened when you applied this remediation..."
        rows={3}
        disabled={addComment.isPending}
        aria-describedby="comment-visibility-notice"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
      />
      {/* Said at the point of writing, not buried in a help page: the author is
          hidden, but the text is not, and it cannot be edited or withdrawn. */}
      <p
        id="comment-visibility-notice"
        className="flex items-start gap-1.5 text-xs text-muted-foreground"
      >
        <InfoIcon className="size-3.5 shrink-0 mt-px" aria-hidden="true" />
        <span>
          Every hospital and the manufacturer can read this. Your name is not
          attached. A comment cannot be edited or deleted once posted.
        </span>
      </p>
      <div className="flex items-center justify-end gap-2">
        {trimmed.length > MAX_BODY_LENGTH && (
          <span className="text-xs text-destructive">
            {trimmed.length} of {MAX_BODY_LENGTH} characters
          </span>
        )}
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {addComment.isPending ? "Posting..." : "Post comment"}
        </Button>
      </div>
    </form>
  );
}

export const RemediationComments = ({
  remediationId,
}: {
  remediationId: string;
}) => {
  const { data, isLoading, isError } = useRemediationComments(remediationId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading comments...</p>;
  }

  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Comments are unavailable. The platform could not be reached.
      </p>
    );
  }

  // No platform behind this remediation keeps comments, so there is nothing to
  // read and nowhere to post. Say so rather than showing an empty box.
  if (!data?.supported) {
    return (
      <p className="text-sm text-muted-foreground">
        This remediation did not come from a platform that hosts comments.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hospital has commented on this remediation yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {data.items.map((comment) => (
            <li key={comment.externalId} className="flex flex-col gap-1">
              <span className="flex items-center gap-2">
                <PseudonymBadge pseudonym={comment.pseudonym} />
                {comment.isMine && (
                  <span className="text-xs font-medium text-primary">You</span>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(comment.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </span>
              <p className="text-sm whitespace-pre-wrap wrap-anywhere">
                {comment.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      {data.nextCursor && (
        <p className="text-xs text-muted-foreground">
          Older comments are not shown.
        </p>
      )}

      <CommentComposer remediationId={remediationId} />
    </div>
  );
};
