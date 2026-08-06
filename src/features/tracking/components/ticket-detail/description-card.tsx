"use client";

import { Badge } from "@/components/ui/badge";
import { MarkdownWithTablesWrapper } from "@/components/ui/markdown-with-tables-wrapper";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getChipClass } from "@/features/tag-colors/palette";
import type { TicketDetail } from "../../types";
import { CollapsibleSectionCard } from "./section-card";

export const DescriptionCard = ({ data }: { data: TicketDetail }) => {
  if (data.descriptions.length === 0 && !data.body) return null;

  const hasTabs =
    data.descriptions.length > 1 ||
    (data.descriptions.length === 1 && !!data.body);

  return (
    <CollapsibleSectionCard title="Description">
      {hasTabs ? (
        <Tabs
          defaultValue={data.descriptions[0]?.department.id ?? "original-email"}
        >
          <TabsList variant="line">
            {data.descriptions.map((d) => (
              <TabsTrigger key={d.id} value={d.department.id}>
                <Badge
                  variant="outline"
                  className={getChipClass(d.department.color)}
                >
                  {d.department.name}
                </Badge>
              </TabsTrigger>
            ))}
            {data.body && (
              <TabsTrigger value="original-email">
                <Badge variant="outline">Original Email</Badge>
              </TabsTrigger>
            )}
          </TabsList>
          {data.descriptions.map((d) => (
            <TabsContent key={d.id} value={d.department.id} className="mt-4">
              <div className="text-sm">
                <MarkdownWithTablesWrapper>{d.body}</MarkdownWithTablesWrapper>
              </div>
            </TabsContent>
          ))}
          {data.body && (
            <TabsContent value="original-email" className="mt-4">
              <div className="text-sm">
                <MarkdownWithTablesWrapper>
                  {data.body}
                </MarkdownWithTablesWrapper>
              </div>
            </TabsContent>
          )}
        </Tabs>
      ) : (
        <div className="text-sm">
          <MarkdownWithTablesWrapper>
            {data.descriptions[0]?.body ?? data.body ?? ""}
          </MarkdownWithTablesWrapper>
        </div>
      )}
    </CollapsibleSectionCard>
  );
};
