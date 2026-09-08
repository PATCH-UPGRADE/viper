"use client";

import { formatDistanceToNow } from "date-fns";
import { InfoIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import {
  useAddRemediationInquiry,
  useRemediationInquiries,
} from "../hooks/use-remediations";

const MAX_BODY_LENGTH = 10_000;

function InquiryComposer({ remediationId }: { remediationId: string }) {
  const [body, setBody] = useState("");
  const addInquiry = useAddRemediationInquiry(remediationId);
  const trimmed = body.trim();
  const canSubmit =
    trimmed.length > 0 &&
    trimmed.length <= MAX_BODY_LENGTH &&
    !addInquiry.isPending;

  useBeforeUnload(trimmed.length > 0);

  const submit = () => {
    if (!canSubmit) return;
    addInquiry.mutate(
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
        placeholder="Ask the manufacturer a question about this remediation..."
        rows={3}
        disabled={addInquiry.isPending}
        aria-describedby="inquiry-visibility-notice"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
      />
      {/* The opposite of the comment notice, and said just as plainly: this one
          carries your hospital's name, and no other hospital can read it. */}
      <p
        id="inquiry-visibility-notice"
        className="flex items-start gap-1.5 text-xs text-muted-foreground"
      >
        <InfoIcon className="size-3.5 shrink-0 mt-px" aria-hidden="true" />
        <span>
          This goes to the manufacturer as your hospital, not anonymously. No
          other hospital can read it.
        </span>
      </p>
      <div className="flex items-center justify-end gap-2">
        {trimmed.length > MAX_BODY_LENGTH && (
          <span className="text-xs text-destructive">
            {trimmed.length} of {MAX_BODY_LENGTH} characters
          </span>
        )}
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {addInquiry.isPending ? "Sending..." : "Ask the manufacturer"}
        </Button>
      </div>
    </form>
  );
}

export const RemediationInquiries = ({
  remediationId,
}: {
  remediationId: string;
}) => {
  const { data, isLoading, isError } = useRemediationInquiries(remediationId);

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Loading questions...</p>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Questions are unavailable. The platform could not be reached.
      </p>
    );
  }

  if (!data?.supported) {
    return (
      <p className="text-sm text-muted-foreground">
        This remediation did not come from a platform that takes questions.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You have not asked the manufacturer anything about this remediation.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {data.items.map((inquiry) => (
            <li
              key={inquiry.externalId}
              className="flex flex-col gap-2 rounded-md border p-3"
            >
              <span className="flex items-center gap-2">
                <span className="text-xs font-medium">You asked</span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(inquiry.createdAt), {
                    addSuffix: true,
                  })}
                </span>
                {inquiry.status && (
                  <Badge variant="outline" className="ml-auto">
                    {inquiry.status}
                  </Badge>
                )}
              </span>
              <p className="text-sm whitespace-pre-wrap wrap-anywhere">
                {inquiry.body}
              </p>

              {inquiry.response ? (
                <div className="border-l-2 pl-3">
                  <p className="text-xs font-medium">
                    The manufacturer answered
                    {inquiry.respondedAt && (
                      <span className="ml-1 font-normal text-muted-foreground">
                        {formatDistanceToNow(new Date(inquiry.respondedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    )}
                  </p>
                  <p className="text-sm whitespace-pre-wrap wrap-anywhere">
                    {inquiry.response}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No answer yet.</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {data.nextCursor && (
        <p className="text-xs text-muted-foreground">
          Older questions are not shown.
        </p>
      )}

      <InquiryComposer remediationId={remediationId} />
    </div>
  );
};
