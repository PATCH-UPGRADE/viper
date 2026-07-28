"use client";
import { Info, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import { Textarea } from "@/components/ui/textarea";
import { useRespondToQuestion } from "../hooks/use-questions";
import type { QuestionWithIssue } from "../types";
import { deviceGroupMatchingLabel } from "@/lib/markdown";
import { cn } from "@/lib/utils";

const NOT_SURE = "Not sure-needs a manual check";

function contextLabel(question: QuestionWithIssue): string {
  if (question.issue.deviceGroupMatching) {
    return deviceGroupMatchingLabel(question.issue.deviceGroupMatching);
  }
  return question.issue.asset?.hostname ?? question.issue.asset?.ip ?? "Asset";
}

export function QuestionCard({ question }: { question: QuestionWithIssue }) {
  const [answerText, setAnswerText] = useState("");
  const [notSure, setNotSure] = useState(false);
  const respond = useRespondToQuestion();

  const isFollowUp = !!question.parentQuestionId;

  if (question.status === "DISMISSED") return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <MessageSquare className="size-4 text-muted-foreground text-orange-600" />
        {isFollowUp && (
          <span className="text-xs font-semibold text-orange-600">
            FOLLOW-UP
          </span>
        )}
        <span className="text-xs font-bold text-muted-language text-orange-600">
          QUESTION
        </span>
        <Badge
          variant="outline"
          className="bg-yellow-500/15 text-yellow-700 border-yellow-500/30 font-bold dark:bg-yellow-500/25 dark:text-yellow-300 dark:border-yellow-500/40"
        >
          {contextLabel(question)}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-base font-semibold">{question.title}</p>
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <Info className="size-3.5 mt-0.5 shrink-0" />
          <span className="font-bold text-foreground whitespace-nowrap">
            Why we're asking:
          </span>
          {question.reasonWhy}
        </p>

        <div className="flex flex-wrap gap-2">
          {question.suggestedAnswers.map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              variant={answerText === suggestion ? "default" : "outline"}
              size="sm"
              className={cn(
                "font-bold text-muted-foreground",
                answerText === suggestion &&
                  !notSure &&
                  "border-primary text-foreground",
              )}
              onClick={() => {
                setAnswerText(suggestion);
                setNotSure(false);
              }}
            >
              {suggestion}
            </Button>
          ))}
          <Button
            type="button"
            variant={answerText === NOT_SURE ? "default" : "outline"}
            size="sm"
            className={cn(
              "font-bold text-muted-foreground",
              notSure && "border-primary text-foreground",
            )}
            onClick={() => {
              setAnswerText(`${NOT_SURE}`);
              setNotSure(true);
            }}
          >
            Not sure - needs a manual check
          </Button>
        </div>
        <Textarea
          value={answerText}
          onChange={(e) => {
            setAnswerText(e.target.value);
            setNotSure(false);
          }}
          placeholder="Or type your own answer..."
          className="min-h-20"
        />
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={respond.isPending}
            onClick={() =>
              respond.mutate({
                questionId: question.id,
                action: "dismiss",
                answer: answerText.trim() || undefined,
              })
            }
          >
            Skip
          </Button>
          <Button
            variant="outline"
            disabled={respond.isPending || !answerText.trim()}
            className="disabled:bg-gray-300 disabled:text-white disabled:opacity-100 disabled:hover:bg-gray-300 disabled:pointer-events-auto disabled:cursor-not-allowed"
            onClick={() =>
              respond.mutate({
                questionId: question.id,
                action: notSure ? "unsure" : "answer",
                answer: answerText.trim(),
              })
            }
          >
            Submit answer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
