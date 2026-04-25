import { useState } from "react";
import { toast } from "sonner";
import { createSearchMissingMutation, createSyncDownloadsMutation } from "~/api/system-downloads";
import { createDownloadEventsExportMutation } from "~/api/system-download-events";
import type { DownloadEventsExportInput, DownloadEventsExportResult } from "~/api/contracts";
import {
  createDownloadEventsCursorPatch,
  DOWNLOADS_EVENTS_SEARCH_KEYS,
} from "~/domain/download/events-search";
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
  const exportDownloadEvents = createDownloadEventsExportMutation();

  const handleDownloadEventsExport = (format: "json" | "csv") => {
    const exportPromise = exportDownloadEvents
      .mutateAsync({ filter: options.eventsExportInput, format })
      .then((result) => {
        setLastDownloadEventsExport(result);
        return result;
      });

    toast.promise(exportPromise, {
      error: (error) => `Failed to export download events: ${error.message}`,
      loading: `Exporting ${format.toUpperCase()} download events...`,
      success: (result) =>
        result.truncated
          ? `Exported ${result.exported} of ${result.total} events (truncated at ${result.limit})`
          : `Exported ${result.exported} download events`,
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
