"use client";
import { Check, Copy, Info, Mail, Pencil, Send } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { handleCopy } from "@/lib/copy";
import type { SuggestedVendorEmail } from "../types";
import { ContactMultiSelect } from "./contacts-multi-select";

export const SuggestedEmailCard = ({
  email,
  onApprove,
  onDismiss,
  isSending = false,
}: {
  email: SuggestedVendorEmail;
  onApprove: (payload: {
    questionId: string;
    toEmails: string[];
    subject: string;
    body: string;
  }) => void;
  onDismiss?: () => void;
  isSending: boolean;
}) => {
  const [toEmails, setToEmails] = useState<string[]>(email.toEmails);
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const [isEditing, setIsEditing] = useState(false);

  const fieldId = useId();
  const toLabelId = `${fieldId}-to`;
  const subjectLabelId = `${fieldId}-subject`;

  const onhandleClickCopy = async () => {
    await handleCopy(`${email.body}`, () => toast.success("Email text copied"));
  };

  const handleRecipientsChange = (value: string) => {
    setToEmails(
      value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 pb-2">
        <Mail className="size-4 text-blue-600" />
        <span className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          Suggested vendor email
        </span>
        <Badge
          variant="secondary"
          className="border-blue-500/30 bg-blue-500/15 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/25 dark:text-blue-300"
        >
          {email.companyName}
        </Badge>
        <Badge variant="secondary">{email.productName}</Badge>
        {isEditing ? (
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => setIsEditing(false)}
          >
            <Check className="size-4" />
            Done
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            aria-label="Edit email"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="size-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <Info className="size-3.5 mt-0.5 shrink-0" />
          <span className="font-bold text-foreground whitespace-nowrap">
            Why send this:
          </span>
          {email.reasonWhy}
        </p>
        <div className="rounded border">
          <div className="flex flex-col gap-2 text-sm border-b bg-muted/50 p-3">
            <div className="flex items-center gap-2">
              <span
                id={toLabelId}
                className="w-16 shrink-0 text-muted-foreground"
              >
                To
              </span>
              <div className="min-w-0 flex-1">
                {isEditing ? (
                  email.contacts.length > 0 ? (
                    <ContactMultiSelect
                      aria-labelledby={toLabelId}
                      options={email.contacts}
                      selected={toEmails}
                      onChange={setToEmails}
                    />
                  ) : (
                    <Input
                      aria-labelledby={toLabelId}
                      value={toEmails.join(", ")}
                      onChange={(e) => handleRecipientsChange(e.target.value)}
                      placeholder="product@vendor.com"
                      disabled={isSending}
                      className="h-8"
                    />
                  )
                ) : (
                  <span className="block truncate text-left font-mono">
                    {toEmails.length > 0
                      ? toEmails.join(",")
                      : "No recipient yet, add one"}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <span
                id={subjectLabelId}
                className="w-16 shrink-0 text-muted-foreground"
              >
                Subject
              </span>
              {isEditing ? (
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={isSending}
                  className="h-8"
                />
              ) : (
                <span className="font-bold">{subject}</span>
              )}
            </div>
          </div>
          {isEditing ? (
            <Textarea
              aria-label="Email body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={isSending}
              className="min-h-40 resize-y whitespace-pre-line rounded-none border-0 px-3 py-4 text-sm shadow-none focus-visible:ring-0"
            />
          ) : (
            <p className="whitespace-pre-line text-sm text-muted-foreground px-3 py-4">
              {body}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button
            className="rounded"
            variant="outline"
            onClick={onDismiss}
            disabled={isSending}
          >
            Dismiss
          </Button>
          <Button
            className="rounded"
            variant="outline"
            onClick={onhandleClickCopy}
            disabled={isSending || isEditing || toEmails.length === 0}
          >
            <Copy className="size-4" />
            <span className="font-bold">Copy text</span>
          </Button>
          <Button
            className="rounded"
            onClick={() =>
              onApprove({
                questionId: email.questionId,
                toEmails,
                subject,
                body,
              })
            }
            disabled={isSending || isEditing || toEmails.length === 0}
          >
            <Send className="size-4" />
            {isSending ? "Sending..." : "Approve & Send"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
