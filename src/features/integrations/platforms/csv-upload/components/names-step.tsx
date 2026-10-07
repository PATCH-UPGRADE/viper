"use client";

import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  type NameDecision,
  type NameDecisions,
  type NameMatch,
  normalizeNameKey,
} from "../contract";
import {
  keyOfProduct,
  type NameCounts,
  type NameReview,
} from "../review/names";
import { ImportFooter, StepHeading, StepLayout } from "./import-frame";

export type NameKind = "manufacturer" | "product";

export const pickedNameKey = (kind: NameKind, nameKey: string) =>
  `${kind}:${nameKey}`;

const NameQuestion = ({
  name,
  match,
  decision,
  onDecide,
}: {
  name: string;
  match: NameMatch["match"];
  decision: NameDecision | undefined;
  onDecide: (decision: NameDecision) => void;
}) => (
  <li className="flex flex-wrap items-center gap-3 border-b py-2 text-sm">
    <span className="min-w-0 flex-1">
      <span className="font-medium">{name}</span>
      <span className="text-muted-foreground">
        {match ? ` looks like ${match.displayName}` : " is new to VIPER"}
      </span>
    </span>
    {match && (
      <Button
        size="sm"
        variant={decision?.kind === "existing" ? "default" : "outline"}
        aria-pressed={decision?.kind === "existing"}
        onClick={() => onDecide({ kind: "existing", id: match.id })}
      >
        Same as {match.displayName}
      </Button>
    )}
    <Button
      size="sm"
      variant={decision?.kind === "new" ? "default" : "outline"}
      aria-pressed={decision?.kind === "new"}
      onClick={() => onDecide({ kind: "new" })}
    >
      Add as new
    </Button>
  </li>
);

export const NamesStep = ({
  review,
  decisions,
  openCount,
  nav,
  onDecide,
  onBack,
  onNext,
}: {
  review: NameReview;
  counts: NameCounts;
  decisions: NameDecisions;
  pickedNames: Record<string, string>;
  openCount: number;
  nav: ReactNode;
  onDecide: (
    kind: NameKind,
    key: string,
    decision: NameDecision,
    pickedName?: string,
  ) => void;
  onBack: () => void;
  onNext: () => void;
}) => {
  const manufacturersToAnswer = [
    ...review.suggestedManufacturers,
    ...review.newManufacturers,
  ];
  const productsToAnswer = [
    ...review.suggestedProducts,
    ...review.newProducts
      .filter(({ isNewWithItsManufacturer }) => !isNewWithItsManufacturer)
      .map(({ product }) => product),
  ];
  const matchedCount =
    review.matchedManufacturers.length + review.matchedProducts.length;
  const nothingToAnswer =
    manufacturersToAnswer.length + productsToAnswer.length === 0;

  return (
    <StepLayout
      nav={nav}
      footer={
        <ImportFooter
          left={
            <Button variant="outline" onClick={onBack}>
              <ArrowLeftIcon />
              Back
            </Button>
          }
          hint={openCount > 0 ? `${openCount} left` : undefined}
          right={
            <Button onClick={onNext}>
              Next: Data issues
              <ArrowRightIcon />
            </Button>
          }
        />
      }
    >
      <StepHeading
        eyebrow="Step B of C"
        title="Are these the same manufacturers and products?"
        description={`${matchedCount} names already match VIPER.`}
      />
      {nothingToAnswer && (
        <p className="text-sm text-muted-foreground">Nothing to answer here.</p>
      )}
      {manufacturersToAnswer.length > 0 && (
        <section className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold">Manufacturers</h4>
          <ul>
            {manufacturersToAnswer.map((manufacturer) => {
              const key = normalizeNameKey(manufacturer.name);
              return (
                <NameQuestion
                  key={key}
                  name={manufacturer.name}
                  match={manufacturer.match}
                  decision={decisions.manufacturers[key]}
                  onDecide={(decision) =>
                    onDecide("manufacturer", key, decision)
                  }
                />
              );
            })}
          </ul>
        </section>
      )}
      {productsToAnswer.length > 0 && (
        <section className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold">Product names</h4>
          <ul>
            {productsToAnswer.map((product) => {
              const key = keyOfProduct(product);
              return (
                <NameQuestion
                  key={key}
                  name={`${product.name} (${product.manufacturer})`}
                  match={product.match}
                  decision={decisions.products[key]}
                  onDecide={(decision) => onDecide("product", key, decision)}
                />
              );
            })}
          </ul>
        </section>
      )}
    </StepLayout>
  );
};
