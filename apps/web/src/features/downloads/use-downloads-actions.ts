import { useState } from "react";
import { createSearchMissingMutation, createSyncDownloadsMutation } from "~/api/system-downloads";
import type { DownloadEventsExportInput, DownloadEventsExportResult } from "~/api/contracts";
import {
  createDownloadEventsCursorPatch,
  DOWNLOADS_EVENTS_SEARCH_KEYS,
} from "~/domain/download/events-search";
import { runDownloadEventsExport } from "~/domain/download/events-export";
import { toDownloadsTab } from "~/features/downloads/downloads-search";
import type { DownloadsSearchPatch } from "~/features/downloads/downloads-search";

interface UseDownloadsActionsOptions {
  updateSearch: (patch: DownloadsSearchPatch) => void;
  eventsExportInput: DownloadEventsExportInput;
  eventsPage: {
    nextCursor?: string | undefined;
    prevCursor?: string | undefined;
  };
}

export function useDownloadsActions(options: UseDownloadsActionsOptions) {
  const [lastDownloadEventsExport, setLastDownloadEventsExport] = useState<
    DownloadEventsExportResult | undefined
  >(undefined);
  const searchMissing = createSearchMissingMutation();
  const syncDownloads = createSyncDownloadsMutation();

  const handleDownloadEventsExport = (format: "json" | "csv") => {
    void runDownloadEventsExport({
      format,
      input: options.eventsExportInput,
      onComplete: (result) => {
        setLastDownloadEventsExport(result);
      },
    });
  };

  const goToPreviousEventsPage = () => {
    options.updateSearch(
      createDownloadEventsCursorPatch(
        DOWNLOADS_EVENTS_SEARCH_KEYS,
        "prev",
        options.eventsPage.prevCursor ?? "",
      ),
    );
  };

  const goToNextEventsPage = () => {
    options.updateSearch(
      createDownloadEventsCursorPatch(
        DOWNLOADS_EVENTS_SEARCH_KEYS,
        "next",
        options.eventsPage.nextCursor ?? "",
      ),
    );
  };

  const triggerSyncDownloads = () => {
    syncDownloads.mutate();
  };

  const triggerSearchMissing = () => {
    searchMissing.mutate(undefined);
  };

  const handleTabChange = (value: string | undefined) => {
    options.updateSearch({ tab: toDownloadsTab(value) });
  };

  return {
    goToNextEventsPage,
    goToPreviousEventsPage,
    handleDownloadEventsExport,
    handleTabChange,
    lastDownloadEventsExport,
    searchMissing,
    triggerSearchMissing,
    syncDownloads,
    triggerSyncDownloads,
  };
}
