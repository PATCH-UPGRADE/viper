import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CSV_IMPORT_POLL_INTERVAL_MS } from "@/config/constants";
import { CsvImportStatus } from "@/generated/prisma";
import { useTRPC } from "@/trpc/client";
import type { ImportStatus } from "../contract";

const FINISHED_STATUSES: CsvImportStatus[] = [
  CsvImportStatus.Succeeded,
  CsvImportStatus.PartiallyFailed,
  CsvImportStatus.Failed,
];

export const isFinished = (status: ImportStatus): boolean =>
  FINISHED_STATUSES.includes(status.status);

export const hasFailures = (status: ImportStatus): boolean =>
  status.failedCount > 0 || status.status === CsvImportStatus.Failed;

export const useSuggestMapping = () => {
  const trpc = useTRPC();
  return useMutation(trpc.csvImport.suggestMapping.mutationOptions());
};

export const useMatchNames = () => {
  const trpc = useTRPC();
  return useMutation(trpc.csvImport.matchNames.mutationOptions());
};

export const useSearchNames = (
  input: {
    kind: "manufacturer" | "product";
    query: string;
    manufacturerId?: string;
  },
  isPickerOpen: boolean,
) => {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.csvImport.searchNames.queryOptions(input),
    enabled: isPickerOpen,
  });
};

export const usePreviewImport = () => {
  const trpc = useTRPC();
  return useMutation(trpc.csvImport.preview.mutationOptions());
};

export const useCreateImport = () => {
  const trpc = useTRPC();
  return useMutation(trpc.csvImport.createImport.mutationOptions());
};

export const useStageRows = () => {
  const trpc = useTRPC();
  return useMutation(trpc.csvImport.stageRows.mutationOptions());
};

export const useStartImport = () => {
  const trpc = useTRPC();
  return useMutation(trpc.csvImport.startImport.mutationOptions());
};

export const useImportStatus = (importId: string | null) => {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.csvImport.status.queryOptions({ importId: importId ?? "" }),
    enabled: importId !== null,
    refetchInterval: (query) =>
      query.state.data && isFinished(query.state.data)
        ? false
        : CSV_IMPORT_POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });
};

export const useFetchFailedRowsCsv = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return (importId: string) =>
    queryClient.fetchQuery(
      trpc.csvImport.failuresCsv.queryOptions({ importId }),
    );
};

export const useImportFailures = (importId: string) => {
  const trpc = useTRPC();
  return useQuery(trpc.csvImport.failures.queryOptions({ importId, page: 1 }));
};
