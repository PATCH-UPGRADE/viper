"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  PlusIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, plural } from "@/lib/utils";
import {
  type NameDecision,
  type NameDecisions,
  type NameMatch,
  normalizeNameKey,
} from "../contract";
import { formatCount } from "../review/labels";
import {
  keyOfProduct,
  type NameCounts,
  type NameReview,
  type ProductMatch,
} from "../review/names";
import {
  ImportFooter,
  OutlinedChoice,
  StepHeading,
  StepLayout,
} from "./import-frame";
import { NamePicker } from "./name-picker";

export type NameKind = "manufacturer" | "product";

export const pickedNameKey = (kind: NameKind, nameKey: string) =>
  `${kind}:${nameKey}`;

const devicesText = (count: number) =>
  `${formatCount(count)} ${plural("device", count)}`;

const SectionLabel = ({ children }: { children: ReactNode }) => (
  <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
    {children}
  </div>
);

const QuestionIcon = ({ answered }: { answered: boolean }) =>
  answered ? (
    <CheckIcon className="size-4.5 text-emerald-600" />
  ) : (
    <TriangleAlertIcon className="size-4.5 text-amber-600" />
  );

const NameBox = ({
  caption,
  name,
  detail,
}: {
  caption: string;
  name: string;
  detail: string;
}) => (
  <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-muted/60 px-3 py-2.5">
    <span className="text-xs text-muted-foreground">{caption}</span>
    <span className="truncate text-[15px] font-semibold" title={name}>
      {name}
    </span>
    <span className="truncate text-xs text-muted-foreground">{detail}</span>
  </div>
);

const SavedAsAnotherName = ({ displayName }: { displayName: string }) => (
  <div className="flex items-center gap-1.5 text-[13px] text-emerald-700 dark:text-emerald-300">
    <CheckIcon className="size-3.5" />
    Will be saved as another name for {displayName}.
  </div>
);

const answerFor = (decision: NameDecision | undefined): string => {
  if (decision?.kind === "existing") return "same";
  if (decision?.kind === "new") return "different";
  return "";
};

const SuggestedNameCard = ({
  title,
  titleSuffix,
  match,
  devices,
  existingCaption,
  sameLabel,
  decision,
  onDecide,
}: {
  title: string;
  titleSuffix?: string;
  match: NameMatch;
  devices: number;
  existingCaption: string;
  sameLabel: string;
  decision: NameDecision | undefined;
  onDecide: (decision: NameDecision) => void;
}) => {
  const existingId = match.match?.id;
  const existingName = match.match?.displayName ?? "";
  const answer = answerFor(decision);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-xl border p-4",
        answer === "same" &&
          "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="shrink-0">
          <QuestionIcon answered={answer !== ""} />
        </span>
        <span className="flex min-w-0 text-[15px] font-semibold">
          <span className="truncate" title={title}>
            {title}
          </span>
          {titleSuffix && (
            <span className="shrink-0 whitespace-pre"> · {titleSuffix}</span>
          )}
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] items-center gap-3">
        <NameBox
          caption="In your file"
          name={match.name}
          detail={devicesText(devices)}
        />
        <ArrowRightIcon className="size-4 text-muted-foreground" />
        <NameBox
          caption="In VIPER"
          name={existingName}
          detail={existingCaption}
        />
      </div>
      <RadioGroup
        value={answer}
        aria-label={`Is ${match.name} the same as ${existingName}?`}
        className="flex gap-2"
        onValueChange={(value) =>
          onDecide(
            value === "same" && existingId
              ? { kind: "existing", id: existingId }
              : { kind: "new" },
          )
        }
      >
        <OutlinedChoice
          value="same"
          label={sameLabel}
          isChosen={answer === "same"}
        />
        <OutlinedChoice
          value="different"
          label="Different, add as new"
          isChosen={answer === "different"}
        />
      </RadioGroup>
      {answer === "same" && <SavedAsAnotherName displayName={existingName} />}
    </div>
  );
};

interface NewNameItem {
  key: string;
  name: string;
  devices: number;
  context?: string;
  decision: NameDecision | undefined;
  pickedName: string | undefined;
  isNewWithItsManufacturer: boolean;
  manufacturerId?: string;
}

const NewNamesCard = ({
  title,
  kind,
  items,
  onDecide,
}: {
  title: string;
  kind: NameKind;
  items: NewNameItem[];
  onDecide: (
    key: string,
    decision: NameDecision | null,
    pickedName?: string,
  ) => void;
}) => {
  const allAnswered = items.every(
    (item) => item.decision || item.isNewWithItsManufacturer,
  );
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-center gap-2.5">
        <QuestionIcon answered={allAnswered} />
        <span className="text-[15px] font-semibold">{title}</span>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((item) => {
          const addsAsNew =
            item.isNewWithItsManufacturer || item.decision?.kind === "new";
          const picksExisting = item.decision?.kind === "existing";
          const wasAddedAsNewByTheUser = item.decision?.kind === "new";
          const canPickExisting =
            !item.isNewWithItsManufacturer &&
            (kind === "manufacturer" || Boolean(item.manufacturerId));
          return (
            <div
              key={item.key}
              className="flex flex-col gap-1.5 rounded-lg bg-muted/60 px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="max-w-md truncate text-sm font-semibold"
                  title={item.name}
                >
                  {item.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {devicesText(item.devices)}
                </span>
                {item.context && (
                  <span className="text-xs text-muted-foreground">
                    · {item.context}
                  </span>
                )}
                <span className="ml-auto flex gap-2">
                  <Button
                    variant={addsAsNew ? "secondary" : "outline"}
                    size="sm"
                    aria-pressed={addsAsNew}
                    disabled={item.isNewWithItsManufacturer}
                    onClick={() =>
                      onDecide(
                        item.key,
                        wasAddedAsNewByTheUser ? null : { kind: "new" },
                      )
                    }
                  >
                    <PlusIcon />
                    Add as new
                  </Button>
                  <NamePicker
                    kind={kind}
                    manufacturerId={item.manufacturerId}
                    pressed={picksExisting}
                    disabled={!canPickExisting}
                    onPick={(picked) =>
                      onDecide(
                        item.key,
                        { kind: "existing", id: picked.id },
                        picked.displayName,
                      )
                    }
                  />
                </span>
              </div>
              {picksExisting && item.pickedName && (
                <SavedAsAnotherName displayName={item.pickedName} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MATCHED_ROWS_SHOWN_AT_FIRST = 8;

interface MatchedNameRow {
  key: string;
  kindLabel: string;
  nameInFile: string;
  nameInViper: string;
  madeBy?: string;
  devices: number;
}

const matchedNameRows = (
  review: NameReview,
  counts: NameCounts,
): MatchedNameRow[] => {
  const manufacturerRows = review.matchedManufacturers.map((manufacturer) => {
    const key = normalizeNameKey(manufacturer.name);
    return {
      key: pickedNameKey("manufacturer", key),
      kindLabel: "Manufacturer",
      nameInFile: manufacturer.name,
      nameInViper: manufacturer.match?.displayName ?? manufacturer.name,
      devices: counts.manufacturers.get(key) ?? 0,
    };
  });
  const productRows = review.matchedProducts.map((product) => {
    const key = keyOfProduct(product);
    return {
      key: pickedNameKey("product", key),
      kindLabel: "Product",
      nameInFile: product.name,
      nameInViper: product.match?.displayName ?? product.name,
      madeBy: product.manufacturer,
      devices: counts.products.get(key) ?? 0,
    };
  });
  return [...manufacturerRows, ...productRows];
};

const MatchedNames = ({
  review,
  counts,
}: {
  review: NameReview;
  counts: NameCounts;
}) => {
  const [showsEveryRow, setShowsEveryRow] = useState(false);
  const manufacturerCount = review.matchedManufacturers.length;
  const productCount = review.matchedProducts.length;
  if (manufacturerCount + productCount === 0) return null;

  const rows = matchedNameRows(review, counts);
  const rowsShown = showsEveryRow
    ? rows
    : rows.slice(0, MATCHED_ROWS_SHOWN_AT_FIRST);
  const hiddenRowCount = rows.length - rowsShown.length;

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-start gap-2.5">
        <CheckIcon className="mt-0.5 size-4.5 shrink-0 text-emerald-600" />
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold">
            {manufacturerCount} {plural("manufacturer", manufacturerCount)} and{" "}
            {productCount} product {plural("name", productCount)} already in
            VIPER
          </span>
          <span className="text-[13px] text-muted-foreground">
            Matched for you. Nothing to answer here.
          </span>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead>In your file</TableHead>
              <TableHead>In VIPER</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Devices</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsShown.map((row) => (
              <TableRow key={row.key}>
                <TableCell
                  className="max-w-72 truncate font-medium"
                  title={row.nameInFile}
                >
                  {row.nameInFile}
                </TableCell>
                <TableCell>
                  <span className="flex flex-wrap items-center gap-2">
                    <ArrowRightIcon
                      aria-hidden
                      className="size-3.5 text-muted-foreground"
                    />
                    <span
                      className="max-w-64 truncate font-medium"
                      title={row.nameInViper}
                    >
                      {row.nameInViper}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.kindLabel}
                  {row.madeBy && ` · ${row.madeBy}`}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {formatCount(row.devices)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {hiddenRowCount > 0 && (
        <Button
          variant="link"
          size="sm"
          className="h-auto self-start px-0"
          onClick={() => setShowsEveryRow(true)}
        >
          Show {formatCount(hiddenRowCount)} more
        </Button>
      )}
    </div>
  );
};

export const NamesStep = ({
  review,
  counts,
  decisions,
  pickedNames,
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
    decision: NameDecision | null,
    pickedName?: string,
  ) => void;
  onBack: () => void;
  onNext: () => void;
}) => {
  const manufacturerIdFor = (product: ProductMatch) => {
    const decision =
      decisions.manufacturers[normalizeNameKey(product.manufacturer)];
    return decision?.kind === "existing" ? decision.id : undefined;
  };
  const hasManufacturerQuestions =
    review.suggestedManufacturers.length + review.newManufacturers.length > 0;
  const hasProductQuestions =
    review.suggestedProducts.length + review.newProducts.length > 0;
  const newManufacturerCount = review.newManufacturers.length;
  const newProductCount = review.newProducts.length;

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
        description="Your file spells some names differently from VIPER. Answer once per name. VIPER remembers your answers for next time."
      />
      {hasManufacturerQuestions && <SectionLabel>Manufacturers</SectionLabel>}
      {review.suggestedManufacturers.map((manufacturer) => {
        const key = normalizeNameKey(manufacturer.name);
        return (
          <SuggestedNameCard
            key={key}
            title={manufacturer.name}
            match={manufacturer}
            devices={counts.manufacturers.get(key) ?? 0}
            existingCaption="Existing manufacturer"
            sameLabel="Same manufacturer"
            decision={decisions.manufacturers[key]}
            onDecide={(decision) => onDecide("manufacturer", key, decision)}
          />
        );
      })}
      {newManufacturerCount > 0 && (
        <NewNamesCard
          kind="manufacturer"
          title={`${newManufacturerCount} ${plural("manufacturer", newManufacturerCount)} ${newManufacturerCount === 1 ? "is" : "are"} new to VIPER`}
          items={review.newManufacturers.map((manufacturer) => {
            const key = normalizeNameKey(manufacturer.name);
            return {
              key,
              name: manufacturer.name,
              devices: counts.manufacturers.get(key) ?? 0,
              decision: decisions.manufacturers[key],
              pickedName: pickedNames[pickedNameKey("manufacturer", key)],
              isNewWithItsManufacturer: false,
            };
          })}
          onDecide={(key, decision, pickedName) =>
            onDecide("manufacturer", key, decision, pickedName)
          }
        />
      )}
      {hasProductQuestions && <SectionLabel>Product names</SectionLabel>}
      {review.suggestedProducts.map((product) => {
        const key = keyOfProduct(product);
        return (
          <SuggestedNameCard
            key={key}
            title={product.name}
            titleSuffix={product.manufacturer}
            match={product}
            devices={counts.products.get(key) ?? 0}
            existingCaption={`Existing ${product.manufacturer} product`}
            sameLabel="Same product"
            decision={decisions.products[key]}
            onDecide={(decision) => onDecide("product", key, decision)}
          />
        );
      })}
      {newProductCount > 0 && (
        <NewNamesCard
          kind="product"
          title={`${newProductCount} product ${plural("name", newProductCount)} ${newProductCount === 1 ? "is" : "are"} new to VIPER`}
          items={review.newProducts.map(
            ({ product, isNewWithItsManufacturer }) => {
              const key = keyOfProduct(product);
              return {
                key,
                name: product.name,
                devices: counts.products.get(key) ?? 0,
                context: product.manufacturer,
                decision: decisions.products[key],
                pickedName: pickedNames[pickedNameKey("product", key)],
                isNewWithItsManufacturer,
                manufacturerId: manufacturerIdFor(product),
              };
            },
          )}
          onDecide={(key, decision, pickedName) =>
            onDecide("product", key, decision, pickedName)
          }
        />
      )}
      <MatchedNames review={review} counts={counts} />
    </StepLayout>
  );
};
