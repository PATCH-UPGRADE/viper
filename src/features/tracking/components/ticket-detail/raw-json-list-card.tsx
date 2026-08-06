"use client";

import { Card } from "@/components/ui/card";

// Placeholder rendering for linked entities that have no dedicated view yet
// (remediations, vulnerabilities).
export function RawJsonListCard<T extends { id: string }>({
  items,
  emptyMessage,
}: {
  items: T[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return (
      <Card className="p-5 text-sm text-muted-foreground">{emptyMessage}</Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <Card key={item.id} className="p-4">
          <pre className="whitespace-pre-wrap break-words text-xs">
            {JSON.stringify(item, null, 2)}
          </pre>
        </Card>
      ))}
    </div>
  );
}
