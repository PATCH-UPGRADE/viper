"use client";

import { createContext, useContext } from "react";

export interface CsvImportControls {
  openImport: () => void;
}

export const CsvImportContext = createContext<CsvImportControls | null>(null);

export const useCsvImport = (): CsvImportControls => {
  const controls = useContext(CsvImportContext);
  if (!controls) {
    throw new Error("useCsvImport must be used inside CsvImportProvider");
  }
  return controls;
};
