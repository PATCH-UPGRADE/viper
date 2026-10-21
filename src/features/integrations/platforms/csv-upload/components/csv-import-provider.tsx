"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { z } from "zod";
import { useTRPC } from "@/trpc/client";
import { CsvImportContext } from "./csv-import-context";
import { CsvImportOverlay } from "./csv-import-overlay";
import { ImportWatcher } from "./import-watcher";

const TRACKED_IMPORTS_KEY = "viper.csv-imports.running";
const trackedImportsSchema = z.array(z.string());

const readTrackedImports = (): string[] => {
  try {
    const stored = window.localStorage.getItem(TRACKED_IMPORTS_KEY);
    const parsed = trackedImportsSchema.safeParse(
      stored ? JSON.parse(stored) : [],
    );
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
};

const writeTrackedImports = (importIds: string[]) => {
  try {
    window.localStorage.setItem(TRACKED_IMPORTS_KEY, JSON.stringify(importIds));
  } catch {
    return;
  }
};

interface OverlayState {
  open: boolean;
  session: number;
  resultImportId: string | null;
}

interface StartedImport {
  importId: string;
  overlaySession: number;
}

export const CsvImportProvider = ({ children }: { children: ReactNode }) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [overlay, setOverlay] = useState<OverlayState>({
    open: false,
    session: 0,
    resultImportId: null,
  });
  const [shownImportId, setShownImportId] = useState<string | null>(null);
  const [importStartedHere, setImportStartedHere] =
    useState<StartedImport | null>(null);
  const isStagingRef = useRef(false);
  const [trackedImportIds, setTrackedImportIds] = useState<string[] | null>(
    null,
  );

  useEffect(() => {
    setTrackedImportIds(readTrackedImports());
  }, []);

  useEffect(() => {
    if (trackedImportIds) writeTrackedImports(trackedImportIds);
  }, [trackedImportIds]);

  const reopenOverlay = useCallback(() => {
    setOverlay((previous) => ({ ...previous, open: true }));
  }, []);

  const noteStaging = useCallback((isStaging: boolean) => {
    isStagingRef.current = isStaging;
  }, []);

  const openImport = useCallback(() => {
    if (isStagingRef.current) {
      reopenOverlay();
      return;
    }
    setShownImportId(null);
    setOverlay((previous) => ({
      open: true,
      session: previous.session + 1,
      resultImportId: null,
    }));
  }, [reopenOverlay]);

  const openResult = useCallback(
    (importId: string) => {
      setShownImportId(importId);
      setOverlay((previous) => {
        const overlayStillHoldsThisImport =
          importStartedHere?.importId === importId &&
          importStartedHere.overlaySession === previous.session;
        if (overlayStillHoldsThisImport) return { ...previous, open: true };
        return {
          open: true,
          session: previous.session + 1,
          resultImportId: importId,
        };
      });
    },
    [importStartedHere],
  );

  const closeOverlay = useCallback(() => {
    setShownImportId(null);
    setOverlay((previous) => ({ ...previous, open: false }));
  }, []);

  const trackImport = useCallback(
    (importId: string, overlaySession: number) => {
      setShownImportId(importId);
      setImportStartedHere({ importId, overlaySession });
      setTrackedImportIds((previous) => [
        ...(previous ?? []).filter((trackedId) => trackedId !== importId),
        importId,
      ]);
      void queryClient.invalidateQueries(
        trpc.integrations.getMany.pathFilter(),
      );
    },
    [queryClient, trpc],
  );

  const untrackImport = useCallback(
    (importId: string) => {
      setTrackedImportIds((previous) =>
        (previous ?? []).filter((trackedId) => trackedId !== importId),
      );
      void queryClient.invalidateQueries(
        trpc.integrations.getMany.pathFilter(),
      );
      void queryClient.invalidateQueries(
        trpc.assets.getManyDashboardInternal.pathFilter(),
      );
      void queryClient.invalidateQueries(
        trpc.assets.getIssueMetricsInternal.pathFilter(),
      );
      void queryClient.invalidateQueries(
        trpc.assets.getRecentVulnerableInternal.pathFilter(),
      );
    },
    [queryClient, trpc],
  );

  const controls = useMemo(() => ({ openImport }), [openImport]);

  return (
    <CsvImportContext.Provider value={controls}>
      {children}
      <CsvImportOverlay
        key={overlay.session}
        open={overlay.open}
        initialImportId={overlay.resultImportId}
        onClose={closeOverlay}
        onReopen={reopenOverlay}
        onStagingChange={noteStaging}
        onImportStarted={(importId) => trackImport(importId, overlay.session)}
      />
      {(trackedImportIds ?? []).map((importId) => (
        <ImportWatcher
          key={importId}
          importId={importId}
          isShownInOverlay={overlay.open && shownImportId === importId}
          opensResultWhenFinished={
            !overlay.open && importStartedHere?.importId === importId
          }
          onFinished={untrackImport}
          onViewResult={openResult}
        />
      ))}
    </CsvImportContext.Provider>
  );
};
