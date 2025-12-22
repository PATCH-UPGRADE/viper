"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

type Chunk = {
  type: string;
  content: string;
  metadata?: Record<string, any>;
  timestamp?: number;
};

export const RecommendationsPage = () => {
  const [requests, setRequests] = useState<Record<number, Chunk[]>>({});
  const [requestId, setRequestId] = useState(-1);
  const [loading, setLoading] = useState(false);

  const pushChunk = (reqId: number, c: Chunk) => {
    setRequests((prev) => ({
      ...prev,
      [reqId]: [...(prev[reqId] || []), c],
    }));
  };

  const normalizeChunk = (input: string): Chunk => {
    const { type, content, metadata, timestamp } = JSON.parse(input);
    return {
      type: type || "item",
      content: typeof content === "string" ? content : JSON.stringify(content),
      metadata,
      timestamp: timestamp,
    };
  };

  async function getRecommendation() {
    const newRequestId = requestId + 1;
    setRequestId(newRequestId);
    setLoading(true);

    // TODO: eventually make this use trpc...
    const res = await fetch("/api/n8n", {
      method: "POST",
    });

    if (!res.ok || !res.body) {
      setLoading(false);
      toast.error("Error reaching n8n");
      console.error(`HTTP error! status: ${res.status}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      setLoading(false);
      if (done) break;
      const chunk = decoder.decode(value);
      console.log(chunk);

      try {
        const normalized = normalizeChunk(chunk);
        if (normalized.type === "end") {
          break;
        }
        pushChunk(newRequestId, normalized);
      } catch (error) {
        console.error(error);
      }
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Recommendations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Get recommendations on remediation deployment.
          </p>
        </div>
        <Badge variant="outline">TODO</Badge>
      </div>

      <Separator />

      <div>
        <h2 className="font-semibold mb-2">All Recommendations</h2>
        <Button onClick={getRecommendation} disabled={loading}>
          Get recommendation
        </Button>
        {loading && <Spinner className="my-6 size-8" />}
        {Object.values(requests).length > 0 ? (
          Object.values(requests)
            .reverse()
            .map((chunks, idx) => {
              const markdownStr = chunks.map((chunk) => chunk.content).join("");
              return (
                <Card className="my-4" key={`requestsCard-${idx}`}>
                  <CardHeader>
                    <CardTitle>Recommendation</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="markdown">
                      {!markdownStr ? (
                        <Spinner />
                      ) : (
                        <Markdown>{markdownStr}</Markdown>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
        ) : (
          <p className="text-sm text-muted-foreground mt-4">
            No recommendations currently. Click the button to get a new
            recommendation.
          </p>
        )}
      </div>
    </div>
  );
};
