"use client";

import { createContext, useContext, useMemo } from "react";
import type { TicketCategory } from "@/generated/prisma";
import { useSuspenseCategoryColors } from "./hooks/use-tag-colors";

type CategoryColorMap = Partial<Record<TicketCategory, string>>;

const CategoryColorContext = createContext<CategoryColorMap>({});

export const CategoryColorProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { data } = useSuspenseCategoryColors();
  const map = useMemo<CategoryColorMap>(() => {
    const m: CategoryColorMap = {};
    for (const row of data) m[row.category] = row.color;
    return m;
  }, [data]);
  return (
    <CategoryColorContext.Provider value={map}>
      {children}
    </CategoryColorContext.Provider>
  );
};

export const useCategoryColor = (category: TicketCategory) => {
  return useContext(CategoryColorContext)[category];
};
