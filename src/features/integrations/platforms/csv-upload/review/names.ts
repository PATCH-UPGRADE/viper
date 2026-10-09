import {
  type CsvAssetRow,
  type MatchNamesOutput,
  type NameDecision,
  type NameDecisions,
  type NameMatch,
  normalizeNameKey,
  productKey,
} from "../contract";

export type ProductMatch = MatchNamesOutput["products"][number];

type NameCells = Pick<CsvAssetRow, "manufacturer" | "product">;

export interface NameCounts {
  manufacturers: Map<string, number>;
  products: Map<string, number>;
}

export interface NewProduct {
  product: ProductMatch;
  isNewWithItsManufacturer: boolean;
}

export interface NameReview {
  suggestedManufacturers: NameMatch[];
  newManufacturers: NameMatch[];
  suggestedProducts: ProductMatch[];
  newProducts: NewProduct[];
  matchedManufacturers: NameMatch[];
  matchedProducts: ProductMatch[];
}

export interface NameDecisionSummary {
  newManufacturers: string[];
  newProducts: string[];
  savedSpellings: string[];
}

export const keyOfProduct = (product: ProductMatch): string =>
  productKey(product.manufacturer, product.name);

export const matchNamesInputFor = (rows: NameCells[]) => {
  const manufacturersByKey = new Map<string, string>();
  const productsByKey = new Map<
    string,
    { manufacturer: string; product: string }
  >();
  for (const { manufacturer, product } of rows) {
    if (!manufacturer) continue;
    const manufacturerKey = normalizeNameKey(manufacturer);
    if (!manufacturersByKey.has(manufacturerKey)) {
      manufacturersByKey.set(manufacturerKey, manufacturer);
    }
    if (!product) continue;
    const key = productKey(manufacturer, product);
    if (!productsByKey.has(key)) {
      productsByKey.set(key, { manufacturer, product });
    }
  }
  return {
    manufacturers: [...manufacturersByKey.values()],
    products: [...productsByKey.values()],
  };
};

export const countNames = (rows: NameCells[]): NameCounts => {
  const manufacturers = new Map<string, number>();
  const products = new Map<string, number>();
  for (const { manufacturer, product } of rows) {
    if (!manufacturer) continue;
    const manufacturerKey = normalizeNameKey(manufacturer);
    manufacturers.set(
      manufacturerKey,
      (manufacturers.get(manufacturerKey) ?? 0) + 1,
    );
    if (!product) continue;
    const key = productKey(manufacturer, product);
    products.set(key, (products.get(key) ?? 0) + 1);
  }
  return { manufacturers, products };
};

const existingDecision = (match: NameMatch): [NameDecision] | [] =>
  match.status === "exact" && match.match
    ? [{ kind: "existing", id: match.match.id }]
    : [];

export const exactMatchDecisions = (
  matches: MatchNamesOutput,
): NameDecisions => ({
  manufacturers: Object.fromEntries(
    matches.manufacturers.flatMap((manufacturer) =>
      existingDecision(manufacturer).map((decision) => [
        normalizeNameKey(manufacturer.name),
        decision,
      ]),
    ),
  ),
  products: Object.fromEntries(
    matches.products.flatMap((product) =>
      existingDecision(product).map((decision) => [
        keyOfProduct(product),
        decision,
      ]),
    ),
  ),
});

const isNewWithItsManufacturer = (
  product: ProductMatch,
  matches: MatchNamesOutput,
  decisions: NameDecisions,
): boolean => {
  const manufacturerKey = normalizeNameKey(product.manufacturer);
  const manufacturerDecision = decisions.manufacturers[manufacturerKey];
  if (manufacturerDecision) return manufacturerDecision.kind === "new";
  const manufacturerMatch = matches.manufacturers.find(
    (manufacturer) => normalizeNameKey(manufacturer.name) === manufacturerKey,
  );
  return manufacturerMatch?.status === "new";
};

const byManufacturerThenName = (first: ProductMatch, second: ProductMatch) =>
  first.manufacturer.localeCompare(second.manufacturer) ||
  first.name.localeCompare(second.name);

export const nameReviewFor = (
  matches: MatchNamesOutput,
  decisions: NameDecisions,
): NameReview => {
  const productsInOrder = [...matches.products].sort(byManufacturerThenName);
  const productsToAsk = productsInOrder.filter(
    (product) => product.status !== "exact",
  );
  const matchedManufacturers = matches.manufacturers.filter(
    (manufacturer) => manufacturer.status === "exact",
  );
  const matchedProducts = productsInOrder.filter(
    (product) => product.status === "exact",
  );
  return {
    suggestedManufacturers: matches.manufacturers.filter(
      (manufacturer) => manufacturer.status === "suggested",
    ),
    newManufacturers: matches.manufacturers.filter(
      (manufacturer) => manufacturer.status === "new",
    ),
    suggestedProducts: productsToAsk.filter(
      (product) =>
        product.status === "suggested" &&
        !isNewWithItsManufacturer(product, matches, decisions),
    ),
    newProducts: productsToAsk
      .map((product) => ({
        product,
        isNewWithItsManufacturer: isNewWithItsManufacturer(
          product,
          matches,
          decisions,
        ),
      }))
      .filter(
        ({ product, isNewWithItsManufacturer }) =>
          product.status === "new" || isNewWithItsManufacturer,
      ),
    matchedManufacturers,
    matchedProducts,
  };
};

export const openNameQuestions = (
  review: NameReview,
  decisions: NameDecisions,
): number => {
  const unansweredManufacturers = [
    ...review.suggestedManufacturers,
    ...review.newManufacturers,
  ].filter(
    (manufacturer) =>
      !decisions.manufacturers[normalizeNameKey(manufacturer.name)],
  );
  const unansweredProducts = [
    ...review.suggestedProducts,
    ...review.newProducts
      .filter(({ isNewWithItsManufacturer }) => !isNewWithItsManufacturer)
      .map(({ product }) => product),
  ].filter((product) => !decisions.products[keyOfProduct(product)]);
  return unansweredManufacturers.length + unansweredProducts.length;
};

export const finalNameDecisions = (
  matches: MatchNamesOutput,
  decisions: NameDecisions,
): NameDecisions => {
  const manufacturerDecisions = matches.manufacturers.flatMap(
    (manufacturer) => {
      const key = normalizeNameKey(manufacturer.name);
      const decision = decisions.manufacturers[key];
      return decision ? [[key, decision] as const] : [];
    },
  );
  const productDecisions = matches.products.flatMap((product) => {
    const key = keyOfProduct(product);
    if (isNewWithItsManufacturer(product, matches, decisions)) {
      const addAsNew: NameDecision = { kind: "new" };
      return [[key, addAsNew] as const];
    }
    const decision = decisions.products[key];
    return decision ? [[key, decision] as const] : [];
  });
  return {
    manufacturers: Object.fromEntries(manufacturerDecisions),
    products: Object.fromEntries(productDecisions),
  };
};

export const summarizeNameDecisions = (
  matches: MatchNamesOutput,
  decisions: NameDecisions,
): NameDecisionSummary => {
  const manufacturerDecisionFor = (manufacturer: NameMatch) =>
    decisions.manufacturers[normalizeNameKey(manufacturer.name)];
  const productDecisionFor = (product: ProductMatch) =>
    decisions.products[keyOfProduct(product)];
  const isSavedSpelling = (
    match: NameMatch,
    decision: NameDecision | undefined,
  ) => match.status !== "exact" && decision?.kind === "existing";

  return {
    newManufacturers: matches.manufacturers
      .filter(
        (manufacturer) => manufacturerDecisionFor(manufacturer)?.kind === "new",
      )
      .map((manufacturer) => manufacturer.name),
    newProducts: matches.products
      .filter((product) => productDecisionFor(product)?.kind === "new")
      .map((product) => product.name),
    savedSpellings: [
      ...matches.manufacturers
        .filter((manufacturer) =>
          isSavedSpelling(manufacturer, manufacturerDecisionFor(manufacturer)),
        )
        .map((manufacturer) => manufacturer.name),
      ...matches.products
        .filter((product) =>
          isSavedSpelling(product, productDecisionFor(product)),
        )
        .map((product) => product.name),
    ],
  };
};
