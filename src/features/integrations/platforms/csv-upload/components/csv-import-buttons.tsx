"use client";

import { PlusIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCsvImport } from "./csv-import-context";

export const CsvUploadAddButton = () => {
  const { openImport } = useCsvImport();
  return (
    <Button size="sm" onClick={openImport}>
      <PlusIcon /> Add
    </Button>
  );
};

export const ImportCsvButton = () => {
  const { openImport } = useCsvImport();
  return (
    <Button variant="outline" size="sm" onClick={openImport}>
      <UploadIcon />
      Import CSV
    </Button>
  );
};
